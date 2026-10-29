/**
 * The FD judge (plan §5.4, M4): replays one recorded flow through the FD engine and gives a
 * fail-closed verdict.
 *
 * The engine is driven exactly as the mock playground drives it when it plays the counterparty:
 * in the role the WORKBENCH played (npType BAP → the workbench was the DEPOSIT_ISSUER; BPP → the
 * INVESTOR_APP). Every message the NP sent is `observe`d; every message the workbench sent is
 * recorded with `sent`; every HTTP answer the NP gave to the workbench is `observe`d as a response
 * (its ACK/NACK, 202 vs 200 and context echo go through the engine's `checkEnvelope` with
 * `leg: "response"` and `httpStatus`). The judge adds the checks the engine leaves to its caller
 * (JUDGE_RULES): the evidence is complete, the NP did not NACK what it had to accept, the
 * workbench did not refuse the NP, and every accepted asynchronous request got its callback.
 *
 * The verdict is PASS only when there is at least one judged message, every step of the flow has
 * recorded evidence, the engine raised no error, and there is no finding at all.
 */
import { fdRoleOfNp, fdWorkbenchRole, FD_HEADERS, FdParticipantRole } from "./constants";
import { FdEngine, FdFinding, FdIdentity, FdJudgeKit, FdRoute, FdState } from "./engine";
import { FdRecord, FdRecordedPayload, header, isRecord, orderRecords, pathParamsOf, queryOf, readRecord } from "./recorded";

/** The checks the judge adds to the engine's. Every judge finding names one of these rules. */
export const JUDGE_RULES = {
  "judge.no-evidence": "The flow has recorded messages to judge.",
  "judge.missing-evidence": "Every step of the flow has a recorded exchange.",
  "judge.unreadable-record": "A recorded exchange carries a JSON request body.",
  "judge.unknown-action": "The recorded message is an action of the FD route table.",
  "judge.rest-call": "The REST call fd-gate recorded (X-Pwb-Fd-Method, X-Pwb-Fd-Path) resolves to the message's route.",
  "judge.direction": "The workbench sent only what the role it played sends.",
  "judge.engine-error": "The engine judged every message without an error; after one, nothing more is judged.",
  "judge.workbench-refused": "The workbench accepted every message the NP sent: no NACK (FD-PWB-* or other) and no refusal on a callback.",
  "judge.workbench-no-answer": "Every message the NP sent has the workbench's recorded answer.",
  "judge.np-no-answer": "The NP answered every message the workbench sent with a JSON body.",
  "judge.np-nack": "The NP did not NACK a message it was due to accept.",
  "judge.ack-echo": "The NP's acknowledgement echoes the context of the message it acknowledges.",
  "judge.callback-missing": "Every asynchronous request that was accepted got its callback.",
  "judge.engine-unavailable": "The FD engine, spec and route table were available to judge the run.",
} as const;

export type JudgeRule = keyof typeof JUDGE_RULES;

export type FdVerdict = "PASS" | "FAIL";

export interface FdJudgedFinding extends FdFinding {
  /** `engine`: from @ondc/fd-contract; `judge`: one of JUDGE_RULES. */
  source: "engine" | "judge";
  flowId: string;
  payloadId?: string;
}

export interface FdJudgedExchange {
  payloadId: string;
  recordedAt: string;
  action?: string;
  sender: "NP" | "WORKBENCH" | "UNKNOWN";
  messageId?: string;
  httpStatus?: number;
  /** The HTTP answer: ACK, NACK (with its code), RESULT (a SYNC answer) or NONE. */
  answer: string;
  judged: boolean;
  findings: number;
}

/** A step of the flow (the playground's flow state), and the payloads recorded for it. */
export interface FdFlowStep {
  actionId?: string;
  action: string;
  payloadIds: string[];
  status?: string;
}

export interface FdJudgeOptions {
  flowId: string;
  transactionId?: string;
  /** The session's npType: the NP under test. */
  npType: "BAP" | "BPP";
  kit: FdJudgeKit;
  /** The flow's steps. Each needs recorded evidence; omitted, only the payloads are judged. */
  steps?: FdFlowStep[];
  /** The workbench's identity when the run holds no message the workbench sent. */
  identity?: FdIdentity;
  keyLookup?: (subscriberId: string, uniqueKeyId: string) => Promise<string>;
}

export interface FdFlowVerdict {
  flowId: string;
  transactionId?: string;
  /** Unset only when the report failed before the roles were known. */
  npRole?: FdParticipantRole;
  workbenchRole?: FdParticipantRole;
  verdict: FdVerdict;
  /** Why the flow failed, in short; empty on a PASS. */
  reasons: string[];
  findings: FdJudgedFinding[];
  exchanges: FdJudgedExchange[];
  /** requirementId → message ids of the judged messages that exercised it. */
  exercised: Record<string, string[]>;
  startedAt?: string;
  finishedAt?: string;
  engineError?: string;
}

const ECHO_KEYS = ["domain", "location", "version", "bap_id", "bap_uri", "bpp_id", "bpp_uri"] as const;

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Judges one recorded flow. Never throws: every failure is a finding, and fails the flow. */
export async function judgeFdFlow(payloads: FdRecordedPayload[], opts: FdJudgeOptions): Promise<FdFlowVerdict> {
  const { kit, flowId } = opts;
  const npRole = fdRoleOfNp(opts.npType);
  const workbenchRole = fdWorkbenchRole(opts.npType);
  const records = orderRecords((payloads ?? []).map((p, i) => readRecord(p, i)));
  const findings: FdJudgedFinding[] = [];
  const exchanges: FdJudgedExchange[] = [];
  const exercised = new Map<string, Set<string>>();

  const reqsOf = (action: string | undefined): string[] =>
    action && kit.requirements.hasAction(action) ? kit.requirements.requirementsFor(action, { inheritFromRequest: true }) : [];

  const judge = (rule: JudgeRule, detail: string, action: string | undefined, record?: FdRecord, messageId?: string): void => {
    const f: FdJudgedFinding = { requirementIds: reqsOf(action), rule, detail, source: "judge", flowId };
    if (action) f.action = action;
    const id = messageId ?? record?.messageId;
    if (id) f.messageId = id;
    if (record) f.payloadId = record.payloadId;
    findings.push(f);
  };
  /** An engine finding. A callback's envelope findings carry no IDs of their own: it answers for its request's. */
  const fromEngine = (list: FdFinding[], record: FdRecord): number => {
    for (const f of list) {
      const out: FdJudgedFinding = { ...f, requirementIds: f.requirementIds?.length ? [...f.requirementIds] : reqsOf(f.action), source: "engine", flowId, payloadId: record.payloadId };
      if (!out.messageId && record.messageId) out.messageId = record.messageId;
      findings.push(out);
    }
    return list.length;
  };

  const senderOf = (r: FdRecord, rt: FdRoute): "NP" | "WORKBENCH" => {
    // fd-gate says who sent it; X-Pwb-Fd-Method alone does not (both modes set it).
    const origin = header(r, FD_HEADERS.origin)?.toLowerCase();
    if (origin === "np") return "NP";
    if (origin === "workbench") return "WORKBENCH";
    if (header(r, FD_HEADERS.method)) return "NP"; // older recordings: fd-gate np mode
    if (header(r, FD_HEADERS.internalKey)) return "WORKBENCH"; // the mock's call through mock/
    return rt.caller === npRole ? "NP" : "WORKBENCH";
  };

  // The engine, with a clock that reads the recorded time of the message being replayed.
  let now = Date.now();
  let engine: FdEngine | undefined;
  let state: FdState | undefined;
  let engineError: string | undefined;
  try {
    const identity = workbenchIdentity(records, kit, workbenchRole, (r, rt) => senderOf(r, rt), opts.identity);
    const cfg: Parameters<FdJudgeKit["createEngine"]>[0] = { role: workbenchRole, identity, clock: () => new Date(now) };
    if (opts.keyLookup) cfg.keyLookup = opts.keyLookup;
    engine = kit.createEngine(cfg);
    state = engine.initialState(opts.transactionId ?? null);
  } catch (e) {
    engineError = errorText(e);
    judge("judge.engine-error", `the engine could not be set up for this flow: ${engineError}`, undefined);
  }

  const ackStatus = (body: Record<string, unknown> | undefined): "ACK" | "NACK" | undefined => {
    if (!body || !kit.isAcknowledgement(body)) return undefined;
    const status = (body.message as Record<string, unknown>)?.ack;
    const s = isRecord(status) ? status.status : undefined;
    return s === "ACK" || s === "NACK" ? s : undefined;
  };
  const errorCode = (body: Record<string, unknown> | undefined): string | undefined => {
    const e = isRecord(body?.error) ? (body?.error as Record<string, unknown>) : undefined;
    return typeof e?.code === "string" ? e.code : undefined;
  };
  const answerText = (body: Record<string, unknown> | undefined): string => {
    if (!body) return "NONE";
    const s = ackStatus(body);
    if (s === "NACK") return `NACK ${errorCode(body) ?? "(no code)"}`;
    return s ?? "RESULT";
  };

  /** Accepted asynchronous requests, to check each got its callback. */
  const acceptedAsync: { record: FdRecord; route: FdRoute }[] = [];
  /** Callbacks seen: `<action>|<inReplyTo>`. */
  const callbacksSeen = new Set<string>();

  for (const record of records) {
    const resolved: ReturnType<typeof resolveRoute> = record.request ? resolveRoute(kit, record) : {};
    const rt = resolved.route;
    const ex: FdJudgedExchange = {
      payloadId: record.payloadId,
      recordedAt: record.recordedAt,
      sender: rt ? senderOf(record, rt) : "UNKNOWN",
      answer: answerText(record.response),
      judged: false,
      findings: 0,
    };
    if (rt) ex.action = rt.action;
    else if (record.bodyAction) ex.action = record.bodyAction;
    if (record.messageId) ex.messageId = record.messageId;
    if (record.httpStatus !== undefined) ex.httpStatus = record.httpStatus;
    exchanges.push(ex);
    if (rt?.kind === "callback" && record.inReplyTo) callbacksSeen.add(`${rt.action}|${record.inReplyTo}`);
    if (!engine || !state || engineError) continue; // after an engine error nothing is judged

    const before = findings.length;
    if (!Number.isNaN(record.recordedMs)) now = record.recordedMs;

    if (!record.request) {
      judge("judge.unreadable-record", "the recorded request is not a JSON object", record.bodyAction, record);
      ex.findings = findings.length - before;
      continue;
    }
    if (!rt) {
      judge("judge.unknown-action", `${String(record.bodyAction)} is not an action of the FD route table`, undefined, record);
      ex.findings = findings.length - before;
      continue;
    }
    if (resolved.restProblem) judge("judge.rest-call", resolved.restProblem, rt.action, record);

    const action = rt.action;
    const answer = record.response;
    try {
      if (ex.sender === "NP") {
        // The NP's message, then the workbench's answer to it.
        const inbound: Parameters<FdEngine["observe"]>[1] = {
          body: record.request,
          action,
          method: (header(record, FD_HEADERS.method) ?? rt.method).toUpperCase(),
          receivedAt: record.recordedAt || new Date(now).toISOString(),
        };
        const params = pathParamsOf(record) ?? resolved.params;
        if (params) inbound.pathParams = params;
        const query = queryOf(record);
        if (query) inbound.query = query;
        const seen = await engine.observe(state, inbound);
        state = seen.state;
        fromEngine(seen.findings, record);

        const status = ackStatus(answer);
        if (!answer) {
          judge("judge.workbench-no-answer", `no answer from the workbench was recorded for ${action}${record.httpStatus ? ` (HTTP ${record.httpStatus})` : ""}`, action, record);
        } else if (status === "NACK") {
          judge("judge.workbench-refused", `the workbench refused the NP's ${action} with ${errorCode(answer) ?? "a NACK without a code"}`, action, record);
        } else if (rt.kind === "request" && rt.mode === "SYNC") {
          const sent: Parameters<FdEngine["sent"]>[1] = { action, body: answer };
          if (record.messageId) sent.answering = record.messageId;
          if (record.httpStatus !== undefined) sent.httpStatus = record.httpStatus;
          if (inbound.pathParams) sent.pathParams = inbound.pathParams;
          state = engine.sent(state, sent);
        } else if (!status) {
          judge("judge.workbench-no-answer", `the workbench's answer to ${action} is not an acknowledgement`, action, record);
        } else if (rt.kind === "request" && rt.mode === "ASYNC_ACK_CALLBACK") {
          acceptedAsync.push({ record, route: rt });
        }
      } else {
        // The workbench's message, then the NP's answer to it.
        if (rt.caller !== workbenchRole) {
          judge("judge.direction", `the workbench, as ${workbenchRole}, does not send ${action} (${rt.caller} → ${rt.callee})`, action, record);
        } else {
          const message: Parameters<FdEngine["sent"]>[1] = { action, body: record.request };
          const params = pathParamsOf(record);
          if (params) message.pathParams = params;
          if (rt.kind === "callback" && record.inReplyTo) message.answering = record.inReplyTo;
          if (header(record, FD_HEADERS.replay) === "1") message.replay = true;
          state = engine.sent(state, message);
          const refusal = isRecord(record.request.message) ? (record.request.message as Record<string, unknown>).error : undefined;
          if (rt.kind === "callback" && isRecord(refusal)) {
            judge("judge.workbench-refused", `the workbench refused the NP's ${rt.inReplyTo} on ${action} with ${String(refusal.code ?? "an error without a code")}`, action, record);
          }

          if (!answer) {
            judge("judge.np-no-answer", `the NP gave no JSON answer to the workbench's ${action}${record.httpStatus ? ` (HTTP ${record.httpStatus})` : ""}`, action, record);
          } else {
            const inbound: Parameters<FdEngine["observe"]>[1] = { body: answer, action, method: rt.method, receivedAt: record.recordedAt || new Date(now).toISOString() };
            if (record.httpStatus !== undefined) inbound.httpStatus = record.httpStatus;
            if (record.messageId) inbound.requestMessageId = record.messageId;
            if (params) inbound.pathParams = params;
            const seen = await engine.observe(state, inbound);
            state = seen.state;
            fromEngine(seen.findings, record);
            const status = ackStatus(answer);
            if (status) checkEcho(record, answer, action, status);
            // As investor app the engine judges a refusal itself (issuer.unexpected-refusal /
            // issuer.expected-refusal); a refusal it neither expected nor reported still fails here.
            const engineJudgedRefusal = seen.findings.some((f) => f.rule === "issuer.unexpected-refusal" || f.rule === "issuer.expected-refusal");
            if (status === "NACK" && !expectedRefusal(state, record.messageId) && !engineJudgedRefusal) {
              judge("judge.np-nack", `the NP NACKed the workbench's ${action} with ${errorCode(answer) ?? "no code"}, where an ACK was due`, action, record);
            }
            if (status === "ACK" && rt.kind === "request" && rt.mode === "ASYNC_ACK_CALLBACK") acceptedAsync.push({ record, route: rt });
          }
        }
      }
    } catch (e) {
      engineError = errorText(e);
      judge("judge.engine-error", `the engine failed on ${action}: ${engineError}`, action, record);
      ex.findings = findings.length - before;
      continue;
    }
    ex.judged = true;
    ex.findings = findings.length - before;
    const evidence = record.messageId ?? record.payloadId;
    for (const id of reqsOf(action)) {
      const set = exercised.get(id) ?? new Set<string>();
      set.add(evidence);
      exercised.set(id, set);
    }
  }

  // Every accepted asynchronous request got its callback.
  if (!engineError) {
    for (const { record, route: rt } of acceptedAsync) {
      if (!rt.callback || !record.messageId) continue;
      if (!callbacksSeen.has(`${rt.callback}|${record.messageId}`)) {
        judge("judge.callback-missing", `${rt.action} ${record.messageId} was accepted, but no ${rt.callback} answering it was recorded`, rt.action, record);
      }
    }
  }

  // Every step of the flow has recorded evidence.
  const recordedIds = new Set(records.map((r) => r.payloadId));
  for (const step of opts.steps ?? []) {
    if (!step.payloadIds.some((id) => recordedIds.has(id))) {
      judge(
        "judge.missing-evidence",
        `step ${step.actionId ?? step.action} (${step.action}) has no recorded exchange${step.status ? ` (step status ${step.status})` : ""}`,
        kit.routes.find(step.action) ? step.action : undefined
      );
    }
  }
  if (records.length === 0) judge("judge.no-evidence", "no recorded message was found for this flow", undefined);

  const judged = exchanges.filter((e) => e.judged).length;
  const reasons: string[] = [];
  if (engineError) reasons.push(`engine error: ${engineError}`);
  if (judged === 0) reasons.push("no message was judged");
  if (findings.length > 0) reasons.push(`${findings.length} finding(s)`);
  const missing = findings.filter((f) => f.rule === "judge.missing-evidence").length;
  if (missing > 0) reasons.push(`${missing} step(s) without evidence`);

  const times = records.filter((r) => !Number.isNaN(r.recordedMs)).map((r) => r.recordedMs);
  const out: FdFlowVerdict = {
    flowId,
    npRole,
    workbenchRole,
    verdict: reasons.length === 0 ? "PASS" : "FAIL",
    reasons,
    findings,
    exchanges,
    exercised: Object.fromEntries([...exercised.entries()].map(([id, set]) => [id, [...set]])),
  };
  if (opts.transactionId) out.transactionId = opts.transactionId;
  if (times.length > 0) {
    out.startedAt = new Date(Math.min(...times)).toISOString();
    out.finishedAt = new Date(Math.max(...times)).toISOString();
  }
  if (engineError) out.engineError = engineError;
  return out;

  /** The NP's acknowledgement echoes the context of the workbench message it acknowledges. */
  function checkEcho(record: FdRecord, answer: Record<string, unknown>, action: string, status: "ACK" | "NACK"): void {
    const sentCtx = isRecord(record.request?.context) ? (record.request?.context as Record<string, unknown>) : undefined;
    const ackCtx = isRecord(answer.context) ? answer.context : undefined;
    if (!sentCtx || !ackCtx) return; // a missing context is the engine's ack.context finding
    const keys: string[] = [...ECHO_KEYS];
    // The engine checks message_id itself when the workbench is the investor app (sync.paired),
    // and the action of an ACK (ack.echo-action); the judge checks the rest.
    if (workbenchRole === "DEPOSIT_ISSUER") keys.push("message_id");
    if (status === "NACK") keys.push("action");
    const differ = keys.filter((k) => !sameJson(sentCtx[k], ackCtx[k]));
    if (differ.length > 0) {
      judge("judge.ack-echo", `the NP's ${status} does not echo the context of ${action}: ${differ.map((k) => `context.${k}`).join(", ")} differ`, action, record);
    }
  }
}

/** True when the engine expects the NP to refuse this workbench message (a negative step). */
function expectedRefusal(state: FdState, messageId: string | undefined): boolean {
  if (!messageId) return false;
  return (state.engine?.messages ?? []).some((m) => m.direction === "out" && m.leg === "request" && m.messageId === messageId && !!m.expectError);
}

/**
 * The route of a recorded exchange: the route fd-gate resolved (`X-Pwb-Fd-Route`), else the REST
 * call (`X-Pwb-Fd-Method` + `X-Pwb-Fd-Path`), else the body's `context.action`. When the REST call
 * was recorded it must resolve to that same route.
 */
function resolveRoute(kit: FdJudgeKit, r: FdRecord): { route?: FdRoute; params?: Record<string, string>; restProblem?: string } {
  const routes = kit.routes;
  const named = header(r, FD_HEADERS.route);
  const method = header(r, FD_HEADERS.method);
  const path = header(r, FD_HEADERS.path);
  const matched = method && path ? routes.match(method, path) : undefined;
  let route = named ? routes.find(named) : undefined;
  if (!route && matched) route = matched.route;
  if (!route && r.bodyAction) route = routes.find(r.bodyAction);
  const out: { route?: FdRoute; params?: Record<string, string>; restProblem?: string } = {};
  if (route) out.route = route;
  if (matched) out.params = matched.params;
  if (method && path) {
    if (!matched) out.restProblem = `${method} ${path} is not an FD route`;
    else if (route && matched.route.action !== route.action) {
      out.restProblem = `${method} ${path} is ${matched.route.action}, not ${route.action}`;
    }
  }
  return out;
}

/**
 * The workbench's identity in the role it played: `bap_*` as investor app, `bpp_*` as issuer.
 * Read from the first message the workbench sent, else the configured fallback, else any message.
 */
function workbenchIdentity(
  records: FdRecord[],
  kit: FdJudgeKit,
  role: FdParticipantRole,
  senderOf: (r: FdRecord, rt: FdRoute) => "NP" | "WORKBENCH",
  fallback: FdIdentity | undefined
): FdIdentity {
  const [idKey, uriKey] = role === "INVESTOR_APP" ? ["bap_id", "bap_uri"] : ["bpp_id", "bpp_uri"];
  const from = (r: FdRecord): FdIdentity | undefined => {
    const ctx = isRecord(r.request?.context) ? (r.request?.context as Record<string, unknown>) : {};
    const id = ctx[idKey];
    const uri = ctx[uriKey];
    return typeof id === "string" && typeof uri === "string" ? { subscriberId: id, subscriberUri: uri } : undefined;
  };
  for (const r of records) {
    const rt = r.request ? resolveRoute(kit, r).route : undefined;
    if (rt && senderOf(r, rt) === "WORKBENCH") {
      const id = from(r);
      if (id) return id;
    }
  }
  if (fallback) return fallback;
  for (const r of records) {
    const id = from(r);
    if (id) return id;
  }
  return { subscriberId: "unknown.workbench.invalid", subscriberUri: "https://unknown.workbench.invalid" };
}

function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
