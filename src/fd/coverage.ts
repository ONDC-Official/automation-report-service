/**
 * The requirement-coverage map of an FD run: requirementId → {status, scenarios, evidence}.
 *
 * - Which requirements a message exercises comes from the engine's requirement map:
 *   `requirementsFor(action, {inheritFromRequest: true})`, so a callback answers for its
 *   request's requirements (no callback in 0.1.4 declares its own).
 * - The requirements in scope are those of every route the NP's role takes part in, as caller or
 *   callee. A requirement no judged message exercised is NOT_COVERED.
 * - A requirement any finding cites is FAIL, in every flow. Otherwise one exercised by a judged
 *   message is PASS. `scenarios` are the flows that exercised or cited it; `evidence` the message
 *   ids.
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

/** Every requirement of a route the NP's role takes part in. */
export function requirementsInScope(kit: FdJudgeKit, npRole: FdParticipantRole): string[] {
  const ids = new Set<string>();
  for (const route of kit.routes.table.routes) {
    if (route.caller !== npRole && route.callee !== npRole) continue;
    for (const id of kit.requirements.requirementsFor(route.action, { inheritFromRequest: true })) ids.add(id);
  }
  return [...ids].sort();
}

export function buildCoverage(flows: FdFlowVerdict[], inScope: string[]): Record<string, FdCoverageEntry> {
  const entries = new Map<string, { failed: boolean; exercised: boolean; scenarios: Set<string>; evidence: Set<string> }>();
  const entry = (id: string) => {
    let e = entries.get(id);
    if (!e) {
      e = { failed: false, exercised: false, scenarios: new Set(), evidence: new Set() };
      entries.set(id, e);
    }
    return e;
  };
  for (const id of inScope) entry(id);
  for (const flow of flows) {
    for (const [id, messageIds] of Object.entries(flow.exercised)) {
      if (messageIds.length === 0) continue;
      const e = entry(id);
      e.exercised = true;
      e.scenarios.add(flow.flowId);
      for (const m of messageIds) e.evidence.add(m);
    }
    for (const finding of flow.findings) {
      for (const id of finding.requirementIds) {
        const e = entry(id);
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
