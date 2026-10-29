/**
 * Certification scope (M7): what a run must contain to certify the NP, from the engine's
 * certification plan (`certificationPlan(role, declaration, {availableFlows})`).
 *
 * - The declaration: the session's `capabilityDeclaration` (the NP's Registry profile, or the
 *   parts of it that scope certification: `actionGroups`, `capabilities`, `regulatoryLicence`),
 *   as an object or JSON text. No session carries one today (the workbench's session cache holds
 *   flowConfigs, usecaseId and the like, and its update API sets no other field), so certification
 *   defaults to a BOOKING-only declaration and the report says so. A declaration that is present
 *   but unreadable is a blocker; the plan is then shown for BOOKING only.
 * - Coverage and the certificate cover exactly the plan's `requirementIds`.
 * - A full run: every flow the plan lists (`flows`, and `missingFlows`, those a runnable scenario
 *   needs but the session's configuration lacks) was started in the session (it has a
 *   transaction in flowMap) and judged in this report. A plan flow `fd_scn_<n>` is met by the session flow of
 *   that id or of its alias (FD_SCENARIO_FLOW_ALIASES).
 * - Fail closed: every plan blocker (gaps, missing flows, declaration problems), every plan flow
 *   that was not run, and an unreadable declaration become findings of the run summary, with no
 *   requirement ID, so automation-db's issuance rule refuses them and no waiver can cover them.
 */
import { FD_DECLARATION_KEY, FD_DEFAULT_DECLARATION, FdParticipantRole, planFlowIdOf, sessionFlowIdsFor } from "./constants";
import { FdCapabilityDeclaration, FdCertificationPlan, FdJudgeKit } from "./engine";
import { FdFlowVerdict } from "./judge";
import { isRecord } from "./recorded";

/** The rules of the certification findings the report adds to the run summary. */
export const CERTIFICATION_RULES = {
  "certification.plan": "The certification plan for the NP's role and declaration has no blocker: no gap, no flow the deployment lacks, no declaration problem.",
  "certification.declaration": "The session's capability declaration, when present, can be read.",
  "certification.missing-flow": "Every flow the certification plan lists was run in the session and judged in this report.",
} as const;

export type CertificationRule = keyof typeof CERTIFICATION_RULES;

/** A finding of the run summary that is not about one message. */
export interface FdCertificationFinding {
  requirementIds: string[];
  rule: string;
  detail: string;
  action?: string;
  messageId?: string;
}

export interface FdDeclarationInfo {
  /** `session`: read from the session; `default`: none was there, so BOOKING only. */
  source: "session" | "default";
  declaration: FdCapabilityDeclaration;
  /** Why the session's declaration could not be used (a blocker). */
  problem?: string;
}

export type FdPlanFlowStatus = "JUDGED" | "NOT_STARTED" | "NOT_IN_REPORT" | "NOT_IN_SESSION";

export interface FdPlanFlow {
  /** The plan's flow id (`fd_booking`, `fd_scn_<n>`). */
  planFlowId: string;
  /** The session flow that ran it. */
  sessionFlowId?: string;
  status: FdPlanFlowStatus;
  verdict?: "PASS" | "FAIL";
}

export interface FdCertificationScope {
  declaration: FdDeclarationInfo;
  plan?: FdCertificationPlan;
  /** The plan could not be computed. */
  planError?: string;
  /** The flow ids the session's configuration has, as the plan names them (its `availableFlows`). */
  availableFlows?: string[];
  flows: FdPlanFlow[];
  /** What coverage and the certificate cover. */
  requirementIds: string[];
  /** A full certification run: every plan flow judged, and a plan to judge it against. */
  full: boolean;
  /** Why it is not a full run. */
  notFull: string[];
  /** Everything that stops certification, in words (the SLA's are reported with the SLA). */
  blockers: string[];
  /** The blockers, as run-summary findings. */
  findings: FdCertificationFinding[];
}

/** The NP's capability declaration: the session's, else BOOKING only. */
export function declarationOf(sessionDetails: unknown): FdDeclarationInfo {
  const fallback = (): FdCapabilityDeclaration => ({ actionGroups: [...FD_DEFAULT_DECLARATION.actionGroups] });
  const raw = isRecord(sessionDetails) ? sessionDetails[FD_DECLARATION_KEY] : undefined;
  if (raw === undefined || raw === null || raw === "") return { source: "default", declaration: fallback() };
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { source: "session", declaration: fallback(), problem: `the session's ${FD_DECLARATION_KEY} is not JSON` };
    }
  }
  const problem = declarationShapeProblem(value);
  if (problem) return { source: "session", declaration: fallback(), problem: `the session's ${FD_DECLARATION_KEY} ${problem}` };
  return { source: "session", declaration: value as FdCapabilityDeclaration };
}

function declarationShapeProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return "is not an object";
  const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (value.actionGroups !== undefined && !strings(value.actionGroups)) return "has actionGroups that are not a list of action groups";
  if (value.capabilities !== undefined) {
    if (!isRecord(value.capabilities)) return "has capabilities that are not an object";
    for (const key of ["servicingActionsSupported", "webhooksSupported"] as const) {
      if (value.capabilities[key] !== undefined && !strings(value.capabilities[key])) return `has capabilities.${key} that is not a list of names`;
    }
  }
  if (value.regulatoryLicence !== undefined && !isRecord(value.regulatoryLicence)) return "has a regulatoryLicence that is not an object";
  return undefined;
}

export interface FdScopeInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the session cache, read defensively
  sessionDetails: any;
  flowMap: Record<string, string>;
  requestedFlows: string[];
}

/**
 * The certification scope of a report: the plan for the NP's role and declaration, which plan
 * flows the session ran, and every blocker. Never throws: a plan that cannot be computed is a
 * blocker, and coverage then falls back to `fallbackRequirementIds` (for display only; the
 * certificate is refused).
 */
export function certificationScope(
  kit: FdJudgeKit,
  npRole: FdParticipantRole,
  input: FdScopeInput,
  flows: FdFlowVerdict[],
  fallbackRequirementIds: () => string[],
  // Test hook: the plan the engine would give (default: the kit's).
  planFor: (declaration: FdCapabilityDeclaration, opts: { availableFlows?: readonly string[] }) => FdCertificationPlan = (d, o) => kit.certificationPlan(npRole, d, o),
): FdCertificationScope {
  const declaration = declarationOf(input.sessionDetails);
  const findings: FdCertificationFinding[] = [];
  const blockers: string[] = [];
  const block = (rule: CertificationRule, detail: string): void => {
    blockers.push(detail);
    findings.push({ requirementIds: [], rule, detail });
  };
  if (declaration.problem) block("certification.declaration", `declaration: ${declaration.problem}`);

  // The flows the deployment has, as the plan names them.
  const configured = isRecord(input.sessionDetails?.flowConfigs) ? Object.keys(input.sessionDetails.flowConfigs) : [];
  const availableFlows = configured.length > 0 ? [...new Set(configured.map(planFlowIdOf))].sort() : undefined;

  let plan: FdCertificationPlan | undefined;
  let planError: string | undefined;
  try {
    plan = planFor(declaration.declaration, availableFlows ? { availableFlows } : {});
  } catch (e) {
    planError = e instanceof Error ? e.message : String(e);
    block("certification.plan", `the certification plan could not be computed: ${planError}`);
  }
  for (const b of plan?.blockers ?? []) block("certification.plan", `plan: ${b}`);

  // Each plan flow: run in the session and judged here?
  const judged = new Map(flows.map((f) => [f.flowId, f] as const));
  const known = new Set([...configured, ...Object.keys(input.flowMap ?? {}), ...input.requestedFlows]);
  // The plan's flows to run, and the ones it needs that the deployment lacks: both are required.
  const required = [...new Set([...(plan?.flows ?? []), ...(plan?.missingFlows ?? [])])].sort();
  const planFlows: FdPlanFlow[] = required.map((planFlowId) => {
    const candidates = sessionFlowIdsFor(planFlowId);
    const inReport = candidates.find((id) => input.requestedFlows.includes(id) && judged.has(id));
    const started = (id: string) => Boolean(input.flowMap?.[id]);
    if (inReport && started(inReport)) {
      return { planFlowId, sessionFlowId: inReport, status: "JUDGED", verdict: judged.get(inReport)!.verdict };
    }
    if (inReport) return { planFlowId, sessionFlowId: inReport, status: "NOT_STARTED" };
    const elsewhere = candidates.find((id) => started(id));
    if (elsewhere) return { planFlowId, sessionFlowId: elsewhere, status: "NOT_IN_REPORT" };
    const configuredAs = candidates.find((id) => known.has(id));
    if (configuredAs) return { planFlowId, sessionFlowId: configuredAs, status: "NOT_STARTED" };
    return { planFlowId, status: "NOT_IN_SESSION" };
  });

  const notFull: string[] = [];
  if (!plan) notFull.push("no certification plan to judge the run against");
  if (input.requestedFlows.length === 0) notFull.push("the report has no flow");
  for (const f of planFlows) {
    if (f.status === "JUDGED") continue;
    const name = f.sessionFlowId && f.sessionFlowId !== f.planFlowId ? `${f.planFlowId} (${f.sessionFlowId})` : f.planFlowId;
    const why =
      f.status === "NOT_STARTED"
        ? "was never started in this session"
        : f.status === "NOT_IN_REPORT"
          ? "ran in this session but is not in this report"
          : "is not a flow of this session";
    const detail = `flow ${name} ${why}`;
    notFull.push(detail);
    block("certification.missing-flow", `the plan needs flow ${name}, which ${why}`);
  }

  return {
    declaration,
    ...(plan ? { plan } : {}),
    ...(planError ? { planError } : {}),
    ...(availableFlows ? { availableFlows } : {}),
    flows: planFlows,
    requirementIds: plan ? [...plan.requirementIds] : fallbackRequirementIds(),
    full: notFull.length === 0,
    notFull,
    blockers,
    findings,
  };
}
