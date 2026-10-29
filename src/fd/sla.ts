/**
 * SLA scoring of a run (M7), from the recorded timings, with the engine's `scoreSla` and
 * `scoreCallbackDeadlines`.
 *
 * Only what the NP answers is scored (route `callee` = the NP's role):
 *
 * - **Answer times.** A sample is one SYNC request the workbench sent the NP and the NP answered
 *   with a JSON body, timed by the payload's `durationMs` (network-observability's duration_ms
 *   around the workbench's call). That duration is the NP's answer time plus the workbench's own
 *   overhead on the call (signing, fd-transport, the network to the NP): a small bias that only
 *   overstates the NP's time. A call the NP made to the workbench measures the workbench, so it
 *   is never a sample. Every SYNC route of the plan's actions that declares an answer time gets a
 *   row, samples or not; fewer than `minSamples` (env `FD_SLA_MIN_SAMPLES`, default 20) is
 *   INSUFFICIENT_SAMPLES, which fails closed, and the row says how many more are needed.
 * - **Callback deadlines.** Each asynchronous request the workbench sent the NP and the NP
 *   acknowledged is paired with the NP's callback answering it (`inReplyTo`): from the request's
 *   recorded time to the callback's, against the route's deadline or the request's `ttl`. A
 *   missing callback fails. Each exchange is recorded after it was answered, so both times lag
 *   their sends by about their own answer time; when the recorder wrote a callback before its
 *   request, the callback is taken as immediate (elapsed 0) and the row says so.
 *
 * Certification needs `slaCertifiable` and `deadlinesCertifiable`. Every row that is not a pass
 * becomes a run-summary finding with no requirement ID (no requirement ID names an answer time),
 * so automation-db's issuance rule refuses it and no waiver can cover it.
 */
import { FD_SLA_DEFAULT_MIN_SAMPLES, FdParticipantRole } from "./constants";
import { FdCallbackDeadlineScore, FdCallbackPair, FdJudgeKit, FdSlaSample, FdSlaScore } from "./engine";
import { FdFlowVerdict, FdJudgedExchange } from "./judge";
import { FdCertificationFinding } from "./plan";

export const SLA_RULES = {
  "sla.answer-time": "Every SYNC route the NP answers meets its declared answer time (nearest-rank percentile) over at least the minimum number of samples.",
  "sla.callback-deadline": "Every callback the NP owed arrived within its route's deadline, else within the request's ttl.",
  "sla.unscorable": "The route table's SLAs and the run's recorded timings could be scored.",
} as const;

export const SLA_BIASES = [
  "An answer time is the workbench module's duration for its call to the NP: the NP's answer time plus the workbench's own overhead (signing, transport, the network to the NP). It can only overstate the NP's time.",
  "Calls the NP made to the workbench measure the workbench, so they are not scored.",
  "A callback deadline runs from the request's recorded time to the callback's. Each exchange is recorded after it is answered, so both lag their sends by about their own answer time; a callback recorded before its request is taken as immediate.",
] as const;

export interface FdAnswerTimeRow extends FdSlaScore {
  /** How many more samples INSUFFICIENT_SAMPLES needs (0 otherwise). */
  needed: number;
  /** Calls of this action that were answered but have no recorded duration (not samples). */
  untimed: number;
}

export interface FdDeadlineRow extends FdCallbackDeadlineScore {
  flowId: string;
  messageId: string;
  /** The recorder wrote the callback before its request; it was taken as immediate. */
  recordedBeforeRequest?: boolean;
}

export interface FdSlaReport {
  minSamples: number;
  /** Why the env value was not used, when it was set but unreadable. */
  minSamplesNote?: string;
  answerTimes: FdAnswerTimeRow[];
  deadlines: FdDeadlineRow[];
  /** slaCertifiable and deadlinesCertifiable, and nothing unscorable. */
  certifiable: boolean;
  /** The engine could not score the run (an SLA text or a time it cannot read). */
  error?: string;
  blockers: string[];
  findings: FdCertificationFinding[];
  biases: readonly string[];
}

/** `FD_SLA_MIN_SAMPLES`: a positive integer, else the default (20), with a note. */
export function slaMinSamples(): { minSamples: number; note?: string } {
  const raw = process.env.FD_SLA_MIN_SAMPLES;
  if (raw === undefined || raw.trim() === "") return { minSamples: FD_SLA_DEFAULT_MIN_SAMPLES };
  const n = Number(raw.trim());
  if (Number.isInteger(n) && n >= 1) return { minSamples: n };
  return { minSamples: FD_SLA_DEFAULT_MIN_SAMPLES, note: `FD_SLA_MIN_SAMPLES=${JSON.stringify(raw)} is not a positive integer; the default ${FD_SLA_DEFAULT_MIN_SAMPLES} applies` };
}

/** The answer-time samples of a run, and the answered calls without a recorded duration. */
export function answerTimeSamples(kit: FdJudgeKit, npRole: FdParticipantRole, flows: FdFlowVerdict[]): { samples: FdSlaSample[]; untimed: Map<string, number> } {
  const samples: FdSlaSample[] = [];
  const untimed = new Map<string, number>();
  for (const flow of flows) {
    for (const ex of flow.exchanges) {
      const route = ex.action ? kit.routes.find(ex.action) : undefined;
      if (!route || ex.sender !== "WORKBENCH" || route.kind !== "request" || route.mode !== "SYNC" || route.callee !== npRole) continue;
      if (ex.answer === "NONE") continue; // no answer to time; the judge reports it
      if (ex.durationMs === undefined) untimed.set(route.action, (untimed.get(route.action) ?? 0) + 1);
      else samples.push({ action: route.action, ms: ex.durationMs });
    }
  }
  return { samples, untimed };
}

/** The NP's acknowledged asynchronous requests, each with the callback that answered it. */
export function callbackPairs(kit: FdJudgeKit, npRole: FdParticipantRole, flows: FdFlowVerdict[]): { pairs: (FdCallbackPair & { flowId: string; messageId: string; recordedBeforeRequest?: boolean })[]; untimed: string[] } {
  const pairs: (FdCallbackPair & { flowId: string; messageId: string; recordedBeforeRequest?: boolean })[] = [];
  const untimed: string[] = [];
  for (const flow of flows) {
    const callbacks = new Map<string, FdJudgedExchange>();
    for (const ex of flow.exchanges) {
      if (ex.sender !== "NP" || !ex.action || !ex.inReplyTo) continue;
      const key = `${ex.action}|${ex.inReplyTo}`;
      if (!callbacks.has(key)) callbacks.set(key, ex);
    }
    const seen = new Set<string>();
    for (const ex of flow.exchanges) {
      const route = ex.action ? kit.routes.find(ex.action) : undefined;
      if (!route || ex.sender !== "WORKBENCH" || route.kind !== "request" || route.mode !== "ASYNC_ACK_CALLBACK" || route.callee !== npRole) continue;
      if (!route.callback || !ex.messageId || ex.answer !== "ACK" || seen.has(ex.messageId)) continue; // a replay is not timed twice
      seen.add(ex.messageId);
      const callback = callbacks.get(`${route.callback}|${ex.messageId}`);
      const requestAt = Date.parse(ex.recordedAt);
      const callbackAt = callback ? Date.parse(callback.recordedAt) : null;
      if (Number.isNaN(requestAt) || (callbackAt !== null && Number.isNaN(callbackAt))) {
        untimed.push(`${flow.flowId}: ${route.action} ${ex.messageId} has no recorded time to measure its ${route.callback} from`);
        continue;
      }
      const request: FdCallbackPair["request"] = ex.ttl ? { action: route.action, ttl: ex.ttl } : { action: route.action };
      const pair: (typeof pairs)[number] = { request, requestAt, callbackAt, flowId: flow.flowId, messageId: ex.messageId };
      if (callbackAt !== null && callbackAt < requestAt) {
        pair.callbackAt = requestAt;
        pair.recordedBeforeRequest = true;
      }
      pairs.push(pair);
    }
  }
  return { pairs, untimed };
}

/**
 * Scores the run's answer times and callback deadlines. `actions`: the plan's (every SYNC route
 * of them that declares an answer time gets a row); undefined scores every route the NP answers.
 * Never throws: what cannot be scored is a blocker.
 */
export function scoreRunSla(kit: FdJudgeKit, npRole: FdParticipantRole, flows: FdFlowVerdict[], actions: readonly string[] | undefined): FdSlaReport {
  const { minSamples, note } = slaMinSamples();
  const report: FdSlaReport = { minSamples, answerTimes: [], deadlines: [], certifiable: false, blockers: [], findings: [], biases: SLA_BIASES };
  if (note) report.minSamplesNote = note;
  const block = (rule: keyof typeof SLA_RULES, detail: string, extra: { action?: string; messageId?: string } = {}): void => {
    report.blockers.push(detail);
    report.findings.push({ requirementIds: [], rule, detail, ...extra });
  };

  let slaOk = false;
  let deadlinesOk = false;
  try {
    const { samples, untimed } = answerTimeSamples(kit, npRole, flows);
    const opts: Parameters<FdJudgeKit["scoreSla"]>[1] = { minSamples, callee: npRole };
    if (actions) opts.actions = actions;
    const scores = kit.scoreSla(samples, opts);
    report.answerTimes = scores.map((s) => ({ ...s, needed: s.verdict === "INSUFFICIENT_SAMPLES" ? Math.max(0, minSamples - s.n) : 0, untimed: untimed.get(s.action) ?? 0 }));
    slaOk = kit.slaCertifiable(scores);
    for (const row of report.answerTimes) {
      const limit = row.limitMs === null ? "" : ` (P${row.percentile} ≤ ${row.limitMs} ms, "${row.sla ?? ""}")`;
      if (row.verdict === "FAIL") {
        block("sla.answer-time", `${row.action}: P${row.percentile} answer time ${row.observedMs} ms over ${row.n} samples exceeds the limit${limit}`, { action: row.action });
      } else if (row.verdict === "INSUFFICIENT_SAMPLES") {
        const untimedNote = row.untimed > 0 ? `; ${row.untimed} more call(s) had no recorded duration` : "";
        block("sla.answer-time", `${row.action}: INSUFFICIENT_SAMPLES, ${row.n} of ${minSamples} timed answers; ${row.needed} more needed${limit}${untimedNote}`, { action: row.action });
      }
    }
  } catch (e) {
    block("sla.unscorable", `answer times could not be scored: ${(e as Error).message}`);
  }
  try {
    const { pairs, untimed } = callbackPairs(kit, npRole, flows);
    const scores = kit.scoreCallbackDeadlines(pairs.map(({ request, requestAt, callbackAt }) => ({ request, requestAt, callbackAt })));
    report.deadlines = scores.map((s, i) => {
      const pair = pairs[i]!;
      const row: FdDeadlineRow = { ...s, flowId: pair.flowId, messageId: pair.messageId };
      if (pair.recordedBeforeRequest) {
        row.recordedBeforeRequest = true;
        row.detail = `${row.detail} (the callback was recorded before its request; taken as immediate)`;
      }
      return row;
    });
    deadlinesOk = kit.deadlinesCertifiable(scores) && untimed.length === 0;
    for (const row of report.deadlines) {
      if (row.verdict !== "PASS") block("sla.callback-deadline", `${row.flowId}: ${row.request} ${row.messageId} → ${row.callback}: ${row.verdict}, ${row.detail}`, { action: row.request, messageId: row.messageId });
    }
    for (const u of untimed) block("sla.unscorable", u);
  } catch (e) {
    block("sla.unscorable", `callback deadlines could not be scored: ${(e as Error).message}`);
  }
  report.certifiable = slaOk && deadlinesOk && report.findings.length === 0;
  const errors = report.findings.filter((f) => f.rule === "sla.unscorable").map((f) => f.detail);
  if (errors.length > 0) report.error = errors.join("; ");
  return report;
}
