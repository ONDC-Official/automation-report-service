/**
 * A recorded FD session, made by the engine itself: one engine plays the workbench, another plays
 * the NP under test, and every exchange between them is written down the way the recorder stores
 * it in automation-db (jsonRequest, jsonResponse: {response}, httpStatus, reqHeader as a JSON
 * string, createdAt). The judge then replays that record.
 *
 * Tests may reach the engine package directly to build fixtures; the service code goes through
 * src/fd/engine.ts only.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { prepareFdJudgeKit, FdJudgeKit } from "../engine";
import { FdFlowStep } from "../judge";
import { FdRecordedPayload } from "../recorded";

/* eslint-disable @typescript-eslint/no-explicit-any -- FD bodies are navigated freely in tests */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const contract: any = require("@ondc/fd-contract");

export const SPEC_PATH =
  process.env.FD_SPEC ?? join(dirname(require.resolve("@ondc/fd-contract/package.json")), "test/fixtures/ondc-fd-protocol.yaml");
export const SPEC_TEXT = readFileSync(SPEC_PATH, "utf8");
export const TABLE = contract.deriveRouteTable(SPEC_TEXT);
export const ROUTES = contract.loadRouteTable(TABLE);

export function judgeKit(): FdJudgeKit {
  return prepareFdJudgeKit({ spec: SPEC_TEXT, routes: TABLE });
}

export const BANK = { subscriberId: "fd.examplebank.in", subscriberUri: "https://fd.examplebank.in/fd/v0.1" };
export const APP = { subscriberId: "fd.exampledistributor.in", subscriberUri: "https://fd.exampledistributor.in/fd/v0.1/callbacks" };
export const TXN = "6a0b6b2e-64c4-4c8a-9b2a-3f6f1c2d55aa";
const START = "2026-09-17T04:48:00.000Z";

/** The booking journey of deposit-journey.md (the engine's own test journey). */
export const BOOKING_JOURNEY: { action: string; webhook?: boolean; userInputs?: Record<string, unknown> }[] = [
  { action: "quote_request" },
  { action: "consent_grant" },
  { action: "application_create" },
  { action: "eligibility_check" },
  { action: "party_submit" },
  { action: "kyc_initiate" },
  { action: "on_kyc_status", webhook: true },
  { action: "account_link" },
  { action: "nominee_register" },
  { action: "application_read" },
  { action: "application_confirm" },
  { action: "payment_instruct" },
  { action: "on_payment_status", webhook: true, userInputs: { paymentState: "REALISED" } },
  { action: "payment_report" },
  { action: "on_deposit_booked", webhook: true },
  { action: "deposit_read" },
];

function renderPath(path: string, params: Record<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => encodeURIComponent(params[name] ?? ""));
}

function ackOf(body: any): any {
  return { context: structuredClone(body.context), message: { ack: { status: "ACK" } } };
}

export interface Tweaks {
  /** The NP's (app's) draft scenario for a request. */
  requestScenario?: Record<string, unknown>;
  /** The issuer's draft scenario for the answer (callback or SYNC answer). */
  answerScenario?: Record<string, unknown>;
  /** Leave the callback out of the record (it was never sent). */
  dropCallback?: boolean;
  /** Replace the answer the receiver of the callback/webhook gave. */
  callbackAnswer?: (ack: any) => { body: any; status: number };
  /** Replace the acknowledgement of the request. */
  requestAnswer?: (ack: any) => { body: any; status: number };
}

/**
 * Two engines in one transaction, and the record of everything they exchanged. `npType` is the
 * NP under test: BAP (the investor app; the workbench is the issuer) or BPP (the issuer; the
 * workbench is the investor app).
 */
export class Session {
  readonly payloads: FdRecordedPayload[] = [];
  readonly steps: FdFlowStep[] = [];
  publicKey = "";
  private t = Date.parse(START);
  private n = 0;
  private issuer: any;
  private app: any;
  private issuerState: any;
  private appState: any;

  private constructor(readonly npType: "BAP" | "BPP") {}

  static async create(npType: "BAP" | "BPP"): Promise<Session> {
    const s = new Session(npType);
    const sodium = await contract.sodiumReady();
    const pair = sodium.crypto_sign_keypair();
    const seed = Buffer.from(pair.privateKey.slice(0, 32)).toString("base64");
    s.publicKey = Buffer.from(pair.publicKey).toString("base64");
    let id = 0;
    const uuid = () => `00000000-0000-4000-8000-${(++id).toString(16).padStart(12, "0")}`;
    const clock = () => new Date(s.t);
    s.issuer = contract.createEngine({
      spec: SPEC_TEXT,
      routes: TABLE,
      identity: { ...BANK, signingPrivateKey: seed, uniqueKeyId: "k-2026-09" },
      role: "DEPOSIT_ISSUER",
      clock,
      uuid,
    });
    s.app = contract.createEngine({
      spec: SPEC_TEXT,
      routes: TABLE,
      identity: APP,
      role: "INVESTOR_APP",
      clock,
      uuid,
      counterparty: BANK,
      keyLookup: s.keyLookup,
    });
    s.issuerState = s.issuer.initialState();
    s.appState = s.app.initialState(TXN);
    return s;
  }

  /** The Registry, for the investor-app side: the bank's key. */
  keyLookup = async (subscriberId: string, uniqueKeyId: string): Promise<string> => {
    if (subscriberId !== BANK.subscriberId || uniqueKeyId !== "k-2026-09") throw new Error(`no key ${subscriberId}|${uniqueKeyId}`);
    return this.publicKey;
  };

  /** Who sent a message from the app (an investor-app action): the NP, when the NP is the app. */
  private appIsNp(): boolean {
    return this.npType === "BAP";
  }

  private record(action: string, sender: "NP" | "WORKBENCH", request: any, answer: { body: any; status: number } | undefined, rest: { method: string; path: string; params: Record<string, string> }): string {
    this.t += 1000;
    const payloadId = `p-${++this.n}`;
    // As fd-gate records them in both modes: the REST call, and who sent it. The playground's
    // internal key is stripped in mock mode, so it is never recorded.
    const headers: Record<string, string[]> = {
      "X-Pwb-Fd-Route": [action],
      "X-Pwb-Fd-Path-Params": [JSON.stringify(rest.params)],
      "X-Pwb-Fd-Method": [rest.method],
      "X-Pwb-Fd-Path": [rest.path],
      "X-Pwb-Fd-Origin": [sender === "NP" ? "np" : "workbench"],
    };
    const p: FdRecordedPayload = {
      payloadId,
      messageId: request?.context?.message_id,
      transactionId: request?.context?.transaction_id,
      flowId: "fd_booking",
      action: action.toUpperCase(),
      reqHeader: JSON.stringify(headers),
      jsonRequest: request,
      jsonResponse: { response: answer?.body },
      createdAt: new Date(this.t).toISOString(),
    };
    if (answer) p.httpStatus = answer.status;
    this.payloads.push(p);
    return payloadId;
  }

  private step(action: string, payloadIds: string[]): void {
    const count = this.steps.filter((s) => s.action === action).length + 1;
    this.steps.push({ action, actionId: `${action}_${count}`, payloadIds, status: payloadIds.length > 0 ? "COMPLETE" : "LISTENING" });
  }

  /** The app sends `action`; the issuer answers (SYNC answer, or ACK and then the callback). */
  async request(action: string, tweaks: Tweaks = {}): Promise<void> {
    const route = ROUTES.get(action);
    const draftReq: any = { action };
    if (tweaks.requestScenario) draftReq.scenario = tweaks.requestScenario;
    const request = await this.app.draft(this.appState, draftReq);
    this.appState = this.app.sent(request.state, { action, body: request.body, pathParams: request.pathParams });
    this.t += 500;
    const inbound = { body: request.body, action, method: route.method, pathParams: request.pathParams };
    const seen = await this.issuer.observe(this.issuerState, inbound);
    this.issuerState = seen.state;
    const rest = { method: route.method, path: renderPath(route.path, request.pathParams), params: request.pathParams };
    const appSender = this.appIsNp() ? "NP" : "WORKBENCH";

    if (route.mode === "SYNC") {
      const answerReq: any = { action, answering: inbound };
      if (tweaks.answerScenario) answerReq.scenario = tweaks.answerScenario;
      const answer = await this.issuer.draft(this.issuerState, answerReq);
      const sent: any = { action, body: answer.body, pathParams: answer.pathParams, answering: request.messageId };
      if (answer.httpStatus !== undefined) sent.httpStatus = answer.httpStatus;
      this.issuerState = this.issuer.sent(answer.state, sent);
      const back: any = { body: answer.body, action, httpStatus: answer.httpStatus ?? 200, requestMessageId: request.messageId };
      this.appState = (await this.app.observe(this.appState, back)).state;
      this.step(action, [this.record(action, appSender, request.body, { body: answer.body, status: answer.httpStatus ?? 200 }, rest)]);
      return;
    }

    // Asynchronous: the issuer's ACK (202), then the callback, which the app acknowledges (200).
    const ack = tweaks.requestAnswer ? tweaks.requestAnswer(ackOf(request.body)) : { body: ackOf(request.body), status: 202 };
    this.appState = (await this.app.observe(this.appState, { body: ack.body, action, httpStatus: ack.status, requestMessageId: request.messageId })).state;
    this.step(action, [this.record(action, appSender, request.body, ack, rest)]);

    const callbackAction = route.callback as string;
    const cbReq: any = { action: callbackAction, answering: inbound };
    if (tweaks.answerScenario) cbReq.scenario = tweaks.answerScenario;
    const callback = await this.issuer.draft(this.issuerState, cbReq);
    this.issuerState = this.issuer.sent(callback.state, { action: callbackAction, body: callback.body, pathParams: callback.pathParams, answering: request.messageId });
    if (tweaks.dropCallback) {
      this.step(callbackAction, []);
      return;
    }
    this.appState = (await this.app.observe(this.appState, { body: callback.body, action: callbackAction })).state;
    const cbAck = tweaks.callbackAnswer ? tweaks.callbackAnswer(ackOf(callback.body)) : { body: ackOf(callback.body), status: 200 };
    const issuerSender = this.appIsNp() ? "WORKBENCH" : "NP";
    this.step(callbackAction, [this.record(callbackAction, issuerSender, callback.body, cbAck, { method: "POST", path: `/${callbackAction}`, params: {} })]);
  }

  /** The issuer sends an unsolicited webhook; the app acknowledges it. */
  async webhook(action: string, userInputs: Record<string, unknown> = {}): Promise<void> {
    const draft = await this.issuer.draft(this.issuerState, { action, userInputs });
    this.issuerState = this.issuer.sent(draft.state, { action, body: draft.body, pathParams: draft.pathParams });
    this.appState = (await this.app.observe(this.appState, { body: draft.body, action })).state;
    const issuerSender = this.appIsNp() ? "WORKBENCH" : "NP";
    this.step(action, [this.record(action, issuerSender, draft.body, { body: ackOf(draft.body), status: 200 }, { method: "POST", path: `/${action}`, params: draft.pathParams ?? {} })]);
  }

  /** Runs the booking journey, with tweaks for some steps; stops after `until` when given. */
  async book(tweaks: Record<string, Tweaks> = {}, until?: string): Promise<this> {
    for (const step of BOOKING_JOURNEY) {
      if (step.webhook) await this.webhook(step.action, step.userInputs ?? {});
      else await this.request(step.action, tweaks[step.action] ?? {});
      if (step.action === until) break;
    }
    return this;
  }
}
