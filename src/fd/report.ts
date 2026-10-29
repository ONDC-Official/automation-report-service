/**
 * The FD report: every requested flow judged by `judgeFdFlow`, the requirement coverage of the
 * run, and the certificate hand-off. The session's FD flows never reach the Beckn validators or
 * Pramaan (reportService routes them here first).
 *
 * Fail-closed throughout: an engine, spec or route table that cannot be loaded, an FD version
 * that is not enabled, or an npType that is neither BAP nor BPP gives a report in which every
 * flow FAILs and the cause is named.
 */
import logger from "@ondc/automation-logger";
import { fdRoleOfNp, fdWorkbenchRole, FdParticipantRole } from "./constants";
import { buildCoverage, FdCoverageEntry, requirementsInScope } from "./coverage";
import { buildRunSummary, FdCertificateOutcome, FdRunSummary, handOffCertificate } from "./certificate";
import { fdIdentityFromEnv, fdRegistryKeyLookup, fetchFdRouteTableSource, readFdSpecSource } from "./config";
import { FdIdentity, FdJudgeKit, prepareFdJudgeKit } from "./engine";
import { FdFlowStep, FdFlowVerdict, judgeFdFlow } from "./judge";
import { FdRecordedPayload, isRecord } from "./recorded";

export interface FdReport {
  sessionId: string;
  domain: string;
  version: string;
  npType?: string;
  npRole?: FdParticipantRole;
  workbenchRole?: FdParticipantRole;
  tableHash?: string;
  contractVersion?: string;
  verdict: "PASS" | "FAIL";
  flows: FdFlowVerdict[];
  coverage: Record<string, FdCoverageEntry>;
  summary?: FdRunSummary;
  certificate?: FdCertificateOutcome;
  /** Whether the report covers a full certification run, and why not. */
  fullRun: { full: boolean; notFull: string[] };
  /** A report-level failure: nothing could be judged. */
  error?: string;
  generatedAt: string;
}

export interface FdReportInput {
  sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the session cache, read defensively
  sessionDetails: any;
  /** The recorded payloads of each requested flow. */
  flows: Record<string, FdRecordedPayload[]>;
  /** The playground's flow state per flow (`/flow/current-state`), or null when it could not be read. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the playground's FlowMap, read defensively
  currentStates: Record<string, any>;
  flowMap: Record<string, string>;
  requestedFlows: string[];
  /** `domain:version` is in ENABLED_DOMAINS. */
  enabled: boolean;
}

export interface FdReportDeps {
  /** The spec and route table. Default: FD_SPEC, FD_ROUTE_TABLE / CONFIG_SERVICE_URL. */
  loadSources?: (domain: string, version: string) => Promise<{ spec: unknown; routes: unknown }>;
  keyLookup?: (subscriberId: string, uniqueKeyId: string) => Promise<string>;
  identity?: FdIdentity;
}

async function defaultSources(domain: string, version: string): Promise<{ spec: unknown; routes: unknown }> {
  const [spec, routes] = await Promise.all([readFdSpecSource(), fetchFdRouteTableSource(domain, version)]);
  return { spec, routes };
}

export async function generateFdReport(input: FdReportInput, deps: FdReportDeps = {}): Promise<FdReport> {
  const { sessionId, sessionDetails } = input;
  const domain = String(sessionDetails?.domain ?? "");
  const version = String(sessionDetails?.version ?? "");
  const report: FdReport = {
    sessionId,
    domain,
    version,
    verdict: "FAIL",
    flows: [],
    coverage: {},
    fullRun: fullRunOf(input),
    generatedAt: new Date().toISOString(),
  };
  if (sessionDetails?.npType !== undefined) report.npType = String(sessionDetails.npType);

  const fail = (error: string): FdReport => {
    logger.error(`[FD] report for session ${sessionId} failed closed: ${error}`);
    report.error = error;
    report.flows = input.requestedFlows.map((flowId) => failedFlow(flowId, input.flowMap[flowId], report, error));
    report.verdict = "FAIL";
    return report;
  };

  if (!input.enabled) return fail(`${domain} ${version} is not an enabled FD version (ENABLED_DOMAINS)`);
  const npType = sessionDetails?.npType;
  if (npType !== "BAP" && npType !== "BPP") return fail(`the session's npType ${JSON.stringify(npType)} is neither BAP nor BPP`);
  report.npRole = fdRoleOfNp(npType);
  report.workbenchRole = fdWorkbenchRole(npType);

  let kit: FdJudgeKit;
  try {
    const sources = await (deps.loadSources ?? defaultSources)(domain, version);
    kit = prepareFdJudgeKit(sources);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (kit.domain !== domain || kit.version !== version) {
    return fail(`the route table is for ${kit.domain} ${kit.version}, but the session is ${domain} ${version}`);
  }
  report.tableHash = kit.tableHash;
  report.contractVersion = kit.contractVersion;

  const keyLookup = deps.keyLookup ?? fdRegistryKeyLookup();
  const identity = deps.identity ?? fdIdentityFromEnv();
  for (const flowId of input.requestedFlows) {
    const state = input.currentStates?.[flowId];
    const steps = stepsOf(state, kit);
    const opts: Parameters<typeof judgeFdFlow>[1] = { flowId, npType, kit };
    const txn = input.flowMap[flowId];
    if (txn) opts.transactionId = txn;
    if (steps) opts.steps = steps;
    if (identity) opts.identity = identity;
    if (keyLookup) opts.keyLookup = keyLookup;
    const verdict = await judgeFdFlow(input.flows[flowId] ?? [], opts);
    if (!steps) {
      // Without the flow's state the steps cannot be checked for evidence: fail closed.
      verdict.findings.push({
        requirementIds: [],
        rule: "judge.missing-evidence",
        detail: "the flow's state could not be read from the workbench, so its steps cannot be checked for evidence",
        source: "judge",
        flowId,
      });
      verdict.verdict = "FAIL";
      verdict.reasons.push("flow state unavailable");
    }
    report.flows.push(verdict);
  }

  report.coverage = buildCoverage(report.flows, requirementsInScope(kit, report.npRole));
  report.verdict = report.flows.length > 0 && report.flows.every((f) => f.verdict === "PASS") ? "PASS" : "FAIL";

  const subscriberId = npSubscriberId(input, report.npRole);
  report.summary = buildRunSummary({
    sessionId,
    subscriberId,
    role: report.npRole,
    domain,
    version,
    tableHash: kit.tableHash,
    contractVersion: kit.contractVersion,
    flows: report.flows,
    coverage: report.coverage,
  });
  report.certificate = await handOffCertificate(report.summary, report.fullRun);
  logger.info(`[FD] report for session ${sessionId}: ${report.verdict}`, {
    flows: report.flows.map((f) => ({ flowId: f.flowId, verdict: f.verdict, findings: f.findings.length })),
    certificate: { decision: report.certificate.decision, sent: report.certificate.sent, status: report.certificate.response?.status },
  });
  return report;
}

/**
 * The flow's API steps and the payloads recorded for each, from the playground's flow state
 * (`sequence[]`: `actionType`, `actionId`, `status`, `payloads.payloads[].payloadId`). A step is an
 * API step when its action is an FD route; forms are skipped. Undefined when there is no state.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the playground's FlowMap
function stepsOf(state: any, kit: FdJudgeKit): FdFlowStep[] | undefined {
  if (!isRecord(state) || !Array.isArray(state.sequence)) return undefined;
  const steps: FdFlowStep[] = [];
  for (const step of state.sequence as unknown[]) {
    if (!isRecord(step)) continue;
    const action = typeof step.actionType === "string" ? step.actionType : undefined;
    if (!action || !kit.routes.find(action)) continue;
    const payloads = isRecord(step.payloads) && Array.isArray(step.payloads.payloads) ? (step.payloads.payloads as unknown[]) : [];
    const out: FdFlowStep = {
      action,
      payloadIds: payloads.map((p) => (isRecord(p) && typeof p.payloadId === "string" ? p.payloadId : "")).filter(Boolean),
    };
    if (typeof step.actionId === "string") out.actionId = step.actionId;
    if (typeof step.status === "string") out.status = step.status;
    steps.push(out);
  }
  return steps;
}

/**
 * A full certification run: every flow of the session's configuration is in this report and was
 * started. (Whether a certificate is then requested also depends on FD_CERTIFY.)
 */
function fullRunOf(input: FdReportInput): { full: boolean; notFull: string[] } {
  const configured = isRecord(input.sessionDetails?.flowConfigs) ? Object.keys(input.sessionDetails.flowConfigs) : [];
  const expected = configured.length > 0 ? configured : Object.keys(input.flowMap ?? {});
  const notFull: string[] = [];
  const absent = expected.filter((f) => !input.requestedFlows.includes(f));
  if (absent.length > 0) notFull.push(`flows not in this report: ${absent.join(", ")}`);
  const unstarted = input.requestedFlows.filter((f) => !input.flowMap?.[f]);
  if (unstarted.length > 0) notFull.push(`flows never started: ${unstarted.join(", ")}`);
  if (input.requestedFlows.length === 0) notFull.push("the report has no flow");
  return { full: notFull.length === 0, notFull };
}

/** The NP's subscriber id: the session's, else the context of the NP's side (bap_id or bpp_id). */
function npSubscriberId(input: FdReportInput, npRole: FdParticipantRole): string {
  const fromSession = input.sessionDetails?.subscriberId;
  if (typeof fromSession === "string" && fromSession) return fromSession;
  const key = npRole === "INVESTOR_APP" ? "bap_id" : "bpp_id";
  for (const flowId of input.requestedFlows) {
    for (const p of input.flows[flowId] ?? []) {
      const ctx = isRecord(p.jsonRequest) && isRecord(p.jsonRequest.context) ? p.jsonRequest.context : undefined;
      if (typeof ctx?.[key] === "string" && ctx[key]) return ctx[key] as string;
    }
  }
  return "";
}

function failedFlow(flowId: string, transactionId: string | undefined, report: FdReport, error: string): FdFlowVerdict {
  const out: FdFlowVerdict = {
    flowId,
    verdict: "FAIL",
    reasons: [error],
    findings: [{ requirementIds: [], rule: "judge.engine-unavailable", detail: error, source: "judge", flowId }],
    exchanges: [],
    exercised: {},
    engineError: error,
  };
  if (transactionId) out.transactionId = transactionId;
  if (report.npRole) out.npRole = report.npRole;
  if (report.workbenchRole) out.workbenchRole = report.workbenchRole;
  return out;
}
