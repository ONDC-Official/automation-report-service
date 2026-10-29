/**
 * The requirement-coverage map of an FD run: requirementId → {status, scenarios, evidence}.
 *
 * - Which requirements a message exercises comes from the engine's requirement map:
 *   `requirementsFor(action, {inheritFromRequest: true})`, so a callback answers for its
 *   request's requirements (no callback in 0.1.4 declares its own).
 * - The requirements in scope are the certification plan's `requirementIds` (plan.ts): those of
 *   the routes the NP's role takes part in within its declared action groups. Coverage has an
 *   entry for each of them and for nothing else. A requirement no judged message exercised is
 *   NOT_COVERED.
 * - A requirement any finding cites is FAIL, in every flow. Otherwise one exercised by a judged
 *   message is PASS. `scenarios` are the flows that exercised or cited it; `evidence` the message
 *   ids. A finding that cites only requirements outside the scope is not in coverage, but it
 *   stays in the run summary's findings, so it still refuses the certificate.
 * - `requirementsInScope` (every requirement of every route the role touches) is the fallback
 *   when no plan can be computed; the certificate is then refused anyway.
 */
import { FdParticipantRole } from "./constants";
import { FdJudgeKit } from "./engine";
import { FdFlowVerdict } from "./judge";

export type FdCoverageStatus = "PASS" | "FAIL" | "NOT_COVERED";

export interface FdCoverageEntry {
  status: FdCoverageStatus;
  scenarios: string[];
  evidence: string[];
}

/** Every requirement of a route the NP's role takes part in (the fallback scope, with no plan). */
export function requirementsInScope(kit: FdJudgeKit, npRole: FdParticipantRole): string[] {
  const ids = new Set<string>();
  for (const route of kit.routes.table.routes) {
    if (route.caller !== npRole && route.callee !== npRole) continue;
    for (const id of kit.requirements.requirementsFor(route.action, { inheritFromRequest: true })) ids.add(id);
  }
  return [...ids].sort();
}

export function buildCoverage(flows: FdFlowVerdict[], inScope: readonly string[]): Record<string, FdCoverageEntry> {
  const entries = new Map<string, { failed: boolean; exercised: boolean; scenarios: Set<string>; evidence: Set<string> }>();
  for (const id of inScope) entries.set(id, { failed: false, exercised: false, scenarios: new Set(), evidence: new Set() });
  const entry = (id: string) => entries.get(id);
  for (const flow of flows) {
    for (const [id, messageIds] of Object.entries(flow.exercised)) {
      if (messageIds.length === 0) continue;
      const e = entry(id);
      if (!e) continue;
      e.exercised = true;
      e.scenarios.add(flow.flowId);
      for (const m of messageIds) e.evidence.add(m);
    }
    for (const finding of flow.findings) {
      for (const id of finding.requirementIds) {
        const e = entry(id);
        if (!e) continue;
        e.failed = true;
        e.scenarios.add(flow.flowId);
        if (finding.messageId) e.evidence.add(finding.messageId);
      }
    }
  }
  const out: Record<string, FdCoverageEntry> = {};
  for (const id of [...entries.keys()].sort()) {
    const e = entries.get(id)!;
    out[id] = {
      status: e.failed ? "FAIL" : e.exercised ? "PASS" : "NOT_COVERED",
      scenarios: [...e.scenarios].sort(),
      evidence: [...e.evidence],
    };
  }
  return out;
}
