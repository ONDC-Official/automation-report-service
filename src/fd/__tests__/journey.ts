/**
 * A recorded FD session, made by the engine itself: one engine plays the workbench, another plays
 * the NP under test, and every exchange between them is written down the way the recorder stores
 * it in automation-db (jsonRequest, jsonResponse: {response}, httpStatus, reqHeader as a JSON
 * string, createdAt, and the FD-only durationMs). The judge then replays that record.
 *
 * A session records one flow: `fd_booking` by default, or any flow id with its own transaction
 * and message ids (`SessionOptions`), so several sessions make one certification run.
 *
 * Tests may reach the engine package directly to build fixtures; the service code goes through
 * src/fd/engine.ts only.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { prepareFdJudgeKit, FdJudgeKit } from "../engine";
import { FdFlowStep } from "../judge";
import { FdRecordedPayload } from "../recorded";
import { FdReportInput } from "../report";

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

export interface SessionOptions {
  /** The flow the record belongs to. Default `fd_booking`. */
  flowId?: string;
  /** Default TXN. */
  transactionId?: string;
  /** Keeps message ids distinct across the sessions of one run (0–4095). Default 0. */
  seq?: number;
  /** When the first exchange is recorded. */
  start?: string;
  /**
   * The recorded duration (ms) of an exchange, as network-observability measures it: undefined
   * records none. Default: 40 ms for every exchange.
   */
  durationMs?: (action: string, sender: "NP" | "WORKBENCH") => number | undefined;
  /** The bank's Ed25519 key (base64 seed and public key). Default: a fresh pair. One run, one key. */
  bankKey?: { seed: string; publicKey: string };
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
  /** The bank's signing seed (base64), to share with the run's other sessions. */
  bankSeed = "";
  private t = Date.parse(START);
  private n = 0;
  private issuer: any;
  private app: any;
  private issuerState: any;
  private appState: any;

  readonly flowId: string;
  readonly transactionId: string;
  private readonly durationMs: (action: string, sender: "NP" | "WORKBENCH") => number | undefined;

  private constructor(readonly npType: "BAP" | "BPP", private readonly opts: SessionOptions) {
    this.flowId = opts.flowId ?? "fd_booking";
    this.transactionId = opts.transactionId ?? TXN;
    this.durationMs = opts.durationMs ?? (() => 40);
    if (opts.start) this.t = Date.parse(opts.start);
  }

  static async create(npType: "BAP" | "BPP", opts: SessionOptions = {}): Promise<Session> {
    const s = new Session(npType, opts);
    let seed: string;
    if (opts.bankKey) {
      seed = opts.bankKey.seed;
      s.publicKey = opts.bankKey.publicKey;
    } else {
      const sodium = await contract.sodiumReady();
      const pair = sodium.crypto_sign_keypair();
      seed = Buffer.from(pair.privateKey.slice(0, 32)).toString("base64");
      s.publicKey = Buffer.from(pair.publicKey).toString("base64");
    }
    s.bankSeed = seed;
    let id = 0;
    const group = (opts.seq ?? 0).toString(16).padStart(3, "0");
    const uuid = () => `00000000-0000-4000-8${group}-${(++id).toString(16).padStart(12, "0")}`;
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
    s.appState = s.app.initialState(s.transactionId);
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
      payloadId: `${this.flowId}-${payloadId}`,
      messageId: request?.context?.message_id,
      transactionId: request?.context?.transaction_id,
      flowId: this.flowId,
      action: action.toUpperCase(),
      reqHeader: JSON.stringify(headers),
      jsonRequest: request,
      jsonResponse: { response: answer?.body },
      createdAt: new Date(this.t).toISOString(),
    };
    if (answer) p.httpStatus = answer.status;
    const duration = this.durationMs(action, sender);
    if (duration !== undefined) p.durationMs = duration;
    this.payloads.push(p);
    return p.payloadId as string;
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

  /** Sends each SYNC request `times` more times (answer-time samples). */
  async repeat(actions: string[], times: number): Promise<this> {
    for (let i = 0; i < times; i++) for (const action of actions) await this.request(action);
    return this;
  }

  /** Moves a recorded exchange's time by `ms` (positive: later). */
  shift(payloadId: string, ms: number): void {
    const p = this.payloads.find((x) => x.payloadId === payloadId);
    if (!p?.createdAt) throw new Error(`no payload ${payloadId}`);
    p.createdAt = new Date(Date.parse(p.createdAt) + ms).toISOString();
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

// ── A certification run: several recorded flows, one session ───────────────

/** The FD spec branch's flows (fd-protocol spec/to_pwb.py), as a session's flowConfigs lists them. */
export const DEPLOYED_FLOWS = [
  "fd_booking",
  "fd_replayed_request",
  "fd_stale_version",
  "fd_replaced_quote_digest",
  "fd_party_conflict",
  "fd_redelivered_booking",
  "fd_out_of_order",
  "fd_quote_expired",
] as const;

/**
 * The session flows that run the BOOKING plan's flows, by NP type: `fd_booking` and the
 * converter's names for the plan's `fd_scn_<n>` flows (FD_SCENARIO_FLOW_ALIASES).
 */
export const BOOKING_PLAN_FLOWS: Record<"BAP" | "BPP", string[]> = {
  BAP: ["fd_booking", "fd_quote_expired", "fd_redelivered_booking", "fd_stale_version", "fd_out_of_order"],
  BPP: ["fd_booking", "fd_stale_version", "fd_replayed_request", "fd_replaced_quote_digest", "fd_party_conflict"],
};

/** The SYNC routes with an answer-time SLA that the issuer answers in the BOOKING plan. */
export const ISSUER_SLA_ACTIONS = ["quote_request", "application_read", "kyc_status_read"];

export interface RunOptions {
  /** Session flows to leave out of the run. */
  skip?: string[];
  /** How many more times the first flow sends each of ISSUER_SLA_ACTIONS (issuer runs). Default 20. */
  samples?: number;
  durationMs?: SessionOptions["durationMs"];
}

/**
 * Records every flow of the BOOKING plan for `npType` as its own transaction. Each flow is the
 * booking journey: the judge replays what was recorded, whatever the flow is called, so this is
 * enough to judge, cover and time a run (the scenarios' own steps are tested in the engine and
 * the end-to-end suites). An issuer run's first flow repeats the SLA'd reads and quotes.
 */
export async function certificationRun(npType: "BAP" | "BPP", opts: RunOptions = {}): Promise<Session[]> {
  const sessions: Session[] = [];
  const flows = BOOKING_PLAN_FLOWS[npType].filter((f) => !(opts.skip ?? []).includes(f));
  for (const [i, flowId] of flows.entries()) {
    const seq = i + 1;
    const sessionOpts: SessionOptions = {
      flowId,
      seq,
      transactionId: `6a0b6b2e-64c4-4c8a-9b2a-${(0x3f6f1c2d5000 + seq).toString(16)}`,
      start: new Date(Date.parse(START) + i * 3_600_000).toISOString(),
    };
    if (opts.durationMs) sessionOpts.durationMs = opts.durationMs;
    const first = sessions[0];
    if (first) sessionOpts.bankKey = { seed: first.bankSeed, publicKey: first.publicKey };
    const session = await (await Session.create(npType, sessionOpts)).book();
    if (npType === "BPP" && i === 0) await session.repeat(ISSUER_SLA_ACTIONS, opts.samples ?? 20);
    sessions.push(session);
  }
  return sessions;
}

/** The playground's flow state for a session's steps. */
export function flowStateOf(steps: FdFlowStep[]): unknown {
  return {
    sequence: steps.map((s, index) => ({
      index,
      actionId: s.actionId,
      actionType: s.action,
      status: s.status,
      payloads: { entryType: "API", action: s.action, payloads: s.payloadIds.map((payloadId) => ({ payloadId })) },
    })),
  };
}

/** The report input reportService would build for a session that ran `sessions`. */
export function reportInput(sessions: Session[], over: Partial<FdReportInput> = {}): FdReportInput {
  const npType = sessions[0]?.npType ?? "BAP";
  const flowMap = Object.fromEntries(sessions.map((s) => [s.flowId, s.transactionId]));
  return {
    sessionId: "session-fd-cert",
    sessionDetails: {
      domain: "ONDC:FIS14:FD",
      version: "0.1.4",
      npType,
      usecaseId: "FIXED DEPOSIT",
      flowMap,
      flowConfigs: Object.fromEntries(DEPLOYED_FLOWS.map((id) => [id, { id }])),
    },
    flows: Object.fromEntries(sessions.map((s) => [s.flowId, s.payloads])),
    currentStates: Object.fromEntries(sessions.map((s) => [s.flowId, flowStateOf(s.steps)])),
    flowMap,
    requestedFlows: sessions.map((s) => s.flowId),
    enabled: true,
    ...over,
  };
}
