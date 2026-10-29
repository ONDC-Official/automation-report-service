/**
 * The certificate hand-off (plan M7): the run summary automation-db's `POST /certificates`
 * expects (automation-db README, "FD certification records"):
 *
 *   {subscriberId, role, domain, version, tableHash, toolVersions{}, runs[{sessionId, flowId,
 *    transactionId, startedAt, finishedAt}], coverage{reqId: {status, scenarios, evidence}},
 *    findings[], waivers[]}
 *
 * - `coverage`: exactly the certification plan's requirement IDs (plan.ts, coverage.ts).
 * - `findings`: every judge and engine finding of every flow, then the certification blockers
 *   (plan blockers, plan flows not run, an unreadable declaration) and every SLA row that is not
 *   a pass (sla.ts). A blocker cites no requirement ID, so the issuance rule refuses it and no
 *   waiver can cover it: the server gives VALID exactly when every in-scope requirement is PASS
 *   with evidence, the plan has no blocker, every plan flow ran, the SLAs pass, and nothing was
 *   found.
 *
 * It is sent only when the deployment certifies (`FD_CERTIFY=true`), automation-db is configured
 * (`AUTOMATION_DB_BASE_URL`, `AUTOMATION_DB_API_KEY`) and the report covers a full certification
 * run (every plan flow judged). Otherwise the report shows what would happen: "would issue:
 * PASS" or "REFUSED", by the same issuance rule the server applies (the server's decision is the
 * one that counts).
 */
import axios from "axios";
import { FdParticipantRole } from "./constants";
import { FdCoverageEntry } from "./coverage";
import { FdJudgedFinding, FdFlowVerdict } from "./judge";

export interface FdRunSummary {
  subscriberId: string;
  role: FdParticipantRole;
  domain: string;
  version: string;
  tableHash: string;
  toolVersions: Record<string, string>;
  runs: { sessionId: string; flowId: string; transactionId: string; startedAt: string; finishedAt: string }[];
  coverage: Record<string, FdCoverageEntry>;
  findings: {
    requirementIds: string[];
    rule: string;
    detail: string;
    errorCode?: string;
    fieldPath?: string;
    messageId?: string;
    action?: string;
  }[];
  waivers: { requirementId: string; reason: string; approvedBy: string; approvedAt: string }[];
}

export interface FdCertificateOutcome {
  /** The issuance rule applied to the summary here (PASS = it would be a VALID certificate). */
  decision: "PASS" | "REFUSED";
  reasons: string[];
  /** True when the summary was posted to automation-db. */
  sent: boolean;
  /** Why it was not sent, when it was not. */
  notSent?: string[];
  /** automation-db's answer to the POST. */
  response?: { certificateId?: string; status?: string; verdict?: string; reasons?: string[] };
  /** The POST failed: the certificate was not issued. */
  error?: string;
}

const IDENTIFIER = /^\S+$/;

function reportServiceVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require("../../package.json") as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

export function buildRunSummary(input: {
  sessionId: string;
  subscriberId: string;
  role: FdParticipantRole;
  domain: string;
  version: string;
  tableHash: string;
  contractVersion: string;
  flows: FdFlowVerdict[];
  coverage: Record<string, FdCoverageEntry>;
  /** Findings about the run as a whole: certification blockers and SLA rows that are not a pass. */
  runFindings?: { requirementIds: string[]; rule: string; detail: string; action?: string; messageId?: string }[];
}): FdRunSummary {
  const runs: FdRunSummary["runs"] = [];
  for (const flow of input.flows) {
    if (!flow.transactionId || !flow.startedAt || !flow.finishedAt) continue;
    runs.push({ sessionId: input.sessionId, flowId: flow.flowId, transactionId: flow.transactionId, startedAt: flow.startedAt, finishedAt: flow.finishedAt });
  }
  const findings = [...input.flows.flatMap((flow) => flow.findings), ...(input.runFindings ?? [])].map(toSummaryFinding);
  return {
    subscriberId: input.subscriberId,
    role: input.role,
    domain: input.domain,
    version: input.version,
    tableHash: input.tableHash,
    toolVersions: { "fd-contract": input.contractVersion, "automation-report-service": reportServiceVersion() },
    runs,
    coverage: input.coverage,
    findings,
    waivers: [],
  };
}

/** A finding as automation-db stores it: no empty strings, requirement IDs without whitespace. */
function toSummaryFinding(f: Pick<FdJudgedFinding, "requirementIds" | "rule" | "detail" | "errorCode" | "fieldPath" | "messageId" | "action">): FdRunSummary["findings"][number] {
  const out: FdRunSummary["findings"][number] = {
    requirementIds: (f.requirementIds ?? []).filter((id) => typeof id === "string" && IDENTIFIER.test(id)),
    rule: f.rule || "unknown",
    detail: f.detail || f.rule || "no detail",
  };
  if (f.errorCode) out.errorCode = f.errorCode;
  if (f.fieldPath) out.fieldPath = f.fieldPath;
  if (f.messageId) out.messageId = f.messageId;
  if (f.action) out.action = f.action;
  return out;
}

/**
 * automation-db's issuance rule (CertificateService.evaluateIssuance), applied here to show what
 * the server would decide. Fail-closed: PASS only if coverage is not empty, every requirement in
 * it is PASS with a scenario and evidence (or WAIVED with a waiver), and every finding is waived.
 */
export function evaluateIssuance(summary: Pick<FdRunSummary, "coverage" | "findings" | "waivers">): { decision: "PASS" | "REFUSED"; reasons: string[] } {
  const reasons: string[] = [];
  const waived = new Set(summary.waivers.map((w) => w.requirementId));
  const ids = Object.keys(summary.coverage).sort();
  if (ids.length === 0) reasons.push("coverage is empty: no requirement was evidenced");
  for (const id of ids) {
    const entry = summary.coverage[id] as FdCoverageEntry | { status: "WAIVED"; scenarios: string[]; evidence: string[] };
    if (entry.status === "PASS") {
      if (entry.scenarios.length === 0) reasons.push(`${id}: PASS cites no scenario`);
      if (entry.evidence.length === 0) reasons.push(`${id}: PASS cites no evidence`);
    } else if (entry.status === "WAIVED") {
      if (!waived.has(id)) reasons.push(`${id}: WAIVED but no waiver is recorded for it`);
    } else {
      reasons.push(`${id}: ${entry.status}`);
    }
  }
  summary.findings.forEach((finding, index) => {
    if (finding.requirementIds.length === 0) {
      reasons.push(`finding ${index} (${finding.rule}): cites no requirement ID, so no waiver can cover it`);
      return;
    }
    const unwaived = finding.requirementIds.filter((id) => !waived.has(id));
    if (unwaived.length > 0) reasons.push(`finding ${index} (${finding.rule}): not waived for ${unwaived.join(", ")}`);
  });
  return { decision: reasons.length === 0 ? "PASS" : "REFUSED", reasons };
}

/** The env that decides whether a summary is posted. */
export function certificationTarget(): { enabled: boolean; baseUrl?: string; apiKey?: string; missing: string[] } {
  const missing: string[] = [];
  const enabled = process.env.FD_CERTIFY === "true";
  if (!enabled) missing.push("FD_CERTIFY is not true");
  const baseUrl = process.env.AUTOMATION_DB_BASE_URL;
  const apiKey = process.env.AUTOMATION_DB_API_KEY;
  if (!baseUrl) missing.push("AUTOMATION_DB_BASE_URL is not set");
  if (!apiKey) missing.push("AUTOMATION_DB_API_KEY is not set");
  const out: { enabled: boolean; baseUrl?: string; apiKey?: string; missing: string[] } = { enabled, missing };
  if (baseUrl) out.baseUrl = baseUrl;
  if (apiKey) out.apiKey = apiKey;
  return out;
}

/**
 * Posts the run summary when certification is on and the run is a full one; otherwise reports
 * what would be issued. Never throws: a failed POST is reported, and means no certificate.
 */
export async function handOffCertificate(summary: FdRunSummary, run: { full: boolean; notFull: string[] }): Promise<FdCertificateOutcome> {
  const local = evaluateIssuance(summary);
  const outcome: FdCertificateOutcome = { decision: local.decision, reasons: local.reasons, sent: false };
  const target = certificationTarget();
  const notSent = [...target.missing, ...(run.full ? [] : run.notFull)];
  if (summary.runs.length === 0) notSent.push("no flow of the run has a transaction and recorded times");
  if (!summary.subscriberId) notSent.push("the NP's subscriber id is unknown");
  if (notSent.length > 0) {
    outcome.notSent = notSent;
    return outcome;
  }
  try {
    const res = await axios.post(`${String(target.baseUrl).replace(/\/$/, "")}/certificates`, summary, {
      headers: { "Content-Type": "application/json", "x-api-key": String(target.apiKey) },
      timeout: 15_000,
    });
    outcome.sent = true;
    const body = (res.data ?? {}) as { certificate?: Record<string, unknown>; reasons?: unknown };
    const cert = body.certificate ?? {};
    const response: NonNullable<FdCertificateOutcome["response"]> = {};
    if (typeof cert.certificateId === "string") response.certificateId = cert.certificateId;
    if (typeof cert.status === "string") response.status = cert.status;
    if (typeof cert.verdict === "string") response.verdict = cert.verdict;
    if (Array.isArray(body.reasons)) response.reasons = body.reasons.map(String);
    outcome.response = response;
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    const data = axios.isAxiosError(e) ? e.response?.data : undefined;
    outcome.error = `POST /certificates failed${status ? ` (HTTP ${status})` : ""}: ${(e as Error).message}${data ? ` ${JSON.stringify(data).slice(0, 500)}` : ""}`;
  }
  return outcome;
}
