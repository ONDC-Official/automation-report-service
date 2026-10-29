/**
 * Certification (M7): coverage scoped by the engine's certification plan, a full run is every
 * plan flow judged, SLA scoring from recorded timings, and a run summary that automation-db's
 * issuance rule passes exactly when the plan is fully covered with no finding.
 *
 * Today's catalogue leaves 11 requirement IDs of a BOOKING-only plan with no runnable flow (plan
 * gaps), so no real BOOKING run can be VALID yet. The VALID cases use the engine's own plan with
 * its gaps closed (`gapFree`), as a catalogue that covered BOOKING would give; one test pins the
 * real plan's refusal.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import axios from "axios";
import { evaluateIssuance } from "../certificate";
import { FdCapabilityDeclaration, FdCertificationPlan, FdJudgeKit } from "../engine";
import { FdParticipantRole } from "../constants";
import { declarationOf } from "../plan";
import { FdReport, FdReportDeps, generateFdReport } from "../report";
import { generateFdHTMLReport } from "../../templates/generateFdReport";
import { certificationRun, ISSUER_SLA_ACTIONS, judgeKit, reportInput, Session, SPEC_TEXT, TABLE } from "./journey";

const sources = async () => ({ spec: SPEC_TEXT, routes: TABLE });

let kit: FdJudgeKit;
beforeAll(() => {
  kit = judgeKit();
});

/** The engine's plan, with its gaps closed: what a catalogue covering every in-scope requirement gives. */
function gapFree(plan: FdCertificationPlan): FdCertificationPlan {
  const blockers = plan.blockers.filter((b) => !b.includes("no runnable flow covers"));
  return { ...plan, requirementIds: [...plan.covered], gaps: [], gapDetails: [], blockers, certifiable: blockers.length === 0 };
}
const gapFreePlan = (role: FdParticipantRole, declaration: FdCapabilityDeclaration, opts: { availableFlows?: readonly string[] }) =>
  gapFree(kit.certificationPlan(role, declaration, opts));

function deps(session: Session, over: Partial<FdReportDeps> = {}): FdReportDeps {
  return { loadSources: sources, keyLookup: session.keyLookup, planFor: gapFreePlan, ...over };
}

const ENV = ["FD_CERTIFY", "AUTOMATION_DB_BASE_URL", "AUTOMATION_DB_API_KEY", "FD_SLA_MIN_SAMPLES"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  jest.restoreAllMocks();
});

function certifying(): void {
  process.env.FD_CERTIFY = "true";
  process.env.AUTOMATION_DB_BASE_URL = "http://automation-db.local";
  process.env.AUTOMATION_DB_API_KEY = "db-key";
}

const rules = (report: FdReport) => report.summary!.findings.map((f) => f.rule);
const row = (report: FdReport, action: string) => report.sla!.answerTimes.find((r) => r.action === action)!;

/** Writes a run summary for automation-db's tests when FD_SUMMARY_FIXTURE_DIR is set. */
function fixture(name: string, report: FdReport): void {
  const dir = process.env.FD_SUMMARY_FIXTURE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(report.summary, null, 2)}\n`);
}

describe("a full BOOKING certification run of the issuer", () => {
  it("with every plan flow and enough samples: the summary passes the issuance rule (VALID), and is posted", async () => {
    certifying();
    const post = jest.spyOn(axios, "post").mockResolvedValue({ status: 201, data: { certificate: { certificateId: "cert-valid", status: "VALID", verdict: "PASS" }, reasons: [] } });
    const sessions = await certificationRun("BPP");
    const report = await generateFdReport(reportInput(sessions), deps(sessions[0]!));

    expect(report.flows.map((f) => [f.flowId, f.verdict, f.findings.length])).toEqual(sessions.map((s) => [s.flowId, "PASS", 0]));
    const scope = report.certification!;
    expect(scope.declaration.source).toBe("default");
    // The plan's fd_scn_<n> flows are met by the converter's flow ids.
    expect(scope.flows.map((f) => [f.planFlowId, f.sessionFlowId, f.status, f.verdict])).toEqual([
      ["fd_booking", "fd_booking", "JUDGED", "PASS"],
      ["fd_scn_34", "fd_stale_version", "JUDGED", "PASS"],
      ["fd_scn_35", "fd_replayed_request", "JUDGED", "PASS"],
      ["fd_scn_36", "fd_replaced_quote_digest", "JUDGED", "PASS"],
      ["fd_scn_37", "fd_party_conflict", "JUDGED", "PASS"],
    ]);
    expect(scope.blockers).toEqual([]);
    expect(report.fullRun).toEqual({ full: true, notFull: [] });

    // Coverage is exactly the plan's requirement IDs, each PASS with a scenario and evidence.
    expect(Object.keys(report.coverage)).toEqual(scope.plan!.requirementIds);
    expect(Object.values(report.coverage).every((e) => e.status === "PASS" && e.scenarios.length > 0 && e.evidence.length > 0)).toBe(true);

    // SLAs: every answer-time row of the plan's SYNC routes passes on at least 20 samples.
    const sla = report.sla!;
    expect(sla.minSamples).toBe(20);
    for (const action of ISSUER_SLA_ACTIONS) {
      expect(row(report, action)).toMatchObject({ verdict: "PASS", needed: 0, observedMs: 40 });
      expect(row(report, action).n).toBeGreaterThanOrEqual(20);
    }
    expect(row(report, "quote_request")).toMatchObject({ limitMs: 3000, percentile: 95 });
    expect(row(report, "application_read")).toMatchObject({ limitMs: 2000 });
    expect(row(report, "kyc_status_read")).toMatchObject({ limitMs: 5000 });
    // Callback deadlines: every acknowledged request the NP owed a callback for, in every flow.
    expect(sla.deadlines.length).toBe(9 * sessions.length);
    expect(sla.deadlines.every((d) => d.verdict === "PASS" && d.elapsedMs === 1000)).toBe(true);
    expect(sla.deadlines.find((d) => d.request === "eligibility_check")!.deadline).toMatchObject({ source: "sla", ms: 30000 });
    expect(sla.deadlines.find((d) => d.request === "application_create")!.deadline).toMatchObject({ source: "ttl", text: "PT30S" });
    expect(sla.certifiable).toBe(true);

    // The summary: no finding at all, so the issuance rule gives VALID.
    const summary = report.summary!;
    expect(summary.findings).toEqual([]);
    expect(summary.runs.map((r) => r.flowId)).toEqual(sessions.map((s) => s.flowId));
    expect(evaluateIssuance(summary)).toEqual({ decision: "PASS", reasons: [] });
    expect(report.certificate).toMatchObject({ decision: "PASS", sent: true, response: { certificateId: "cert-valid", status: "VALID" } });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![1]).toBe(summary);
    fixture("fd-run-summary-valid.json", report);

    const { html } = generateFdHTMLReport(report);
    expect(html).toContain("5 of 5 required flows run and judged");
    expect(html).toContain("fd_stale_version");
    expect(html).toContain("Answer times");
    expect(html).toContain("kyc_status_read");
  });

  it("with today's plan, its gaps refuse it: 11 BOOKING requirements no runnable flow covers", async () => {
    const sessions = await certificationRun("BPP");
    const report = await generateFdReport(reportInput(sessions), deps(sessions[0]!, { planFor: undefined }));
    const plan = report.certification!.plan!;
    expect(plan.gaps).toEqual(["FD-CON-05", "FD-CON-07", "FD-ERR-01", "FD-ERR-04", "FD-ERR-05", "FD-JRN-04", "FD-REF-01", "FD-REF-02", "FD-REF-03", "FD-STA-01", "FD-STA-02"]);
    expect(report.fullRun.full).toBe(true);
    for (const id of plan.gaps) expect(report.coverage[id]?.status).toBe("NOT_COVERED");
    expect(rules(report)).toEqual(["certification.plan"]);
    const decision = evaluateIssuance(report.summary!);
    expect(decision.decision).toBe("REFUSED");
    expect(decision.reasons).toContain("FD-REF-01: NOT_COVERED");
    expect(decision.reasons.some((r) => r.includes("certification.plan") && r.includes("cites no requirement ID"))).toBe(true);
    expect(generateFdHTMLReport(report).html).toContain("Scenarios that would cover it");
  });

  it("a missing flow: REFUSED with a blocker, and nothing is posted", async () => {
    certifying();
    const post = jest.spyOn(axios, "post");
    const sessions = await certificationRun("BPP", { skip: ["fd_party_conflict"] });
    const report = await generateFdReport(reportInput(sessions), deps(sessions[0]!));
    expect(report.verdict).toBe("PASS"); // every flow that ran passed
    const missing = report.certification!.flows.find((f) => f.planFlowId === "fd_scn_37")!;
    expect(missing).toEqual({ planFlowId: "fd_scn_37", sessionFlowId: "fd_party_conflict", status: "NOT_STARTED" });
    expect(report.certification!.blockers).toEqual(["the plan needs flow fd_scn_37 (fd_party_conflict), which was never started in this session"]);
    expect(report.fullRun).toEqual({ full: false, notFull: ["flow fd_scn_37 (fd_party_conflict) was never started in this session"] });

    expect(report.summary!.findings).toEqual([
      { requirementIds: [], rule: "certification.missing-flow", detail: "the plan needs flow fd_scn_37 (fd_party_conflict), which was never started in this session" },
    ]);
    expect(report.certificate).toMatchObject({ decision: "REFUSED", sent: false, notSent: ["flow fd_scn_37 (fd_party_conflict) was never started in this session"] });
    expect(report.certificate!.reasons).toEqual(["finding 0 (certification.missing-flow): cites no requirement ID, so no waiver can cover it"]);
    expect(post).not.toHaveBeenCalled();
    fixture("fd-run-summary-missing-flow.json", report);
    expect(generateFdHTMLReport(report).html).toContain("4 of 5 required flows run and judged");
  });

  it("a slow NP (P95 over the limit): REFUSED", async () => {
    const sessions = await certificationRun("BPP", { durationMs: (action, sender) => (action === "quote_request" && sender === "WORKBENCH" ? 3500 : 40) });
    const report = await generateFdReport(reportInput(sessions), deps(sessions[0]!));
    expect(report.verdict).toBe("PASS");
    expect(row(report, "quote_request")).toMatchObject({ verdict: "FAIL", observedMs: 3500, limitMs: 3000 });
    expect(row(report, "application_read").verdict).toBe("PASS");
    expect(report.sla!.certifiable).toBe(false);
    expect(report.summary!.findings).toEqual([
      {
        requirementIds: [],
        rule: "sla.answer-time",
        detail: expect.stringMatching(/^quote_request: P95 answer time 3500 ms over \d+ samples exceeds the limit \(P95 ≤ 3000 ms/),
        action: "quote_request",
      },
    ]);
    expect(evaluateIssuance(report.summary!).decision).toBe("REFUSED");
    expect(report.certificate!.decision).toBe("REFUSED");
  });

  it("too few samples: REFUSED with INSUFFICIENT_SAMPLES, naming how many more each action needs", async () => {
    const sessions = await certificationRun("BPP", { samples: 0 });
    const report = await generateFdReport(reportInput(sessions), deps(sessions[0]!));
    // Each booking journey asks for one quote and one application read; no flow reads the KYC status.
    expect(row(report, "quote_request")).toMatchObject({ verdict: "INSUFFICIENT_SAMPLES", n: 5, needed: 15 });
    expect(row(report, "application_read")).toMatchObject({ verdict: "INSUFFICIENT_SAMPLES", n: 5, needed: 15 });
    expect(row(report, "kyc_status_read")).toMatchObject({ verdict: "INSUFFICIENT_SAMPLES", n: 0, needed: 20 });
    expect(report.summary!.findings.map((f) => f.detail)).toEqual([
      'application_read: INSUFFICIENT_SAMPLES, 5 of 20 timed answers; 15 more needed (P95 ≤ 2000 ms, "P95 ≤ 2s")',
      'kyc_status_read: INSUFFICIENT_SAMPLES, 0 of 20 timed answers; 20 more needed (P95 ≤ 5000 ms, "P95 ≤ 5s")',
      'quote_request: INSUFFICIENT_SAMPLES, 5 of 20 timed answers; 15 more needed (P95 ≤ 3000 ms, "Response: 3 seconds. Minimum quote validity: 30 minutes (D-12).")',
    ]);
    expect(rules(report)).toEqual(["sla.answer-time", "sla.answer-time", "sla.answer-time"]);
    expect(report.certificate!.decision).toBe("REFUSED");
    const { html } = generateFdHTMLReport(report);
    expect(html).toContain("INSUFFICIENT_SAMPLES");
    expect(html).toContain("15 more");
  });

  it("FD_SLA_MIN_SAMPLES sets the minimum; an unreadable value keeps the default of 20", async () => {
    const sessions = await certificationRun("BPP", { samples: 0 });
    process.env.FD_SLA_MIN_SAMPLES = "5";
    const lenient = await generateFdReport(reportInput(sessions), deps(sessions[0]!));
    expect(lenient.sla!.minSamples).toBe(5);
    expect(row(lenient, "quote_request")).toMatchObject({ verdict: "PASS", n: 5 });
    expect(row(lenient, "kyc_status_read")).toMatchObject({ verdict: "INSUFFICIENT_SAMPLES", needed: 5 });

    process.env.FD_SLA_MIN_SAMPLES = "0";
    const bad = await generateFdReport(reportInput(sessions), deps(sessions[0]!));
    expect(bad.sla!.minSamples).toBe(20);
    expect(bad.sla!.minSamplesNote).toMatch(/not a positive integer; the default 20 applies/);
  });

  it("a payload without durationMs is not a sample", async () => {
    const sessions = await certificationRun("BPP", { durationMs: (action, sender) => (action === "application_read" && sender === "WORKBENCH" ? undefined : 40) });
    const report = await generateFdReport(reportInput(sessions), deps(sessions[0]!));
    expect(row(report, "application_read")).toMatchObject({ verdict: "INSUFFICIENT_SAMPLES", n: 0, untimed: 25, needed: 20 });
    expect(report.certificate!.decision).toBe("REFUSED");
  });

  it("a late callback fails its deadline; one recorded before its request is taken as immediate", async () => {
    const sessions = await certificationRun("BPP");
    const booking = sessions[0]!;
    const late = booking.payloads.find((p) => p.action === "ON_ELIGIBILITY_CHECK")!;
    booking.shift(late.payloadId!, 31_000); // eligibility_check's SLA: 30 seconds
    const early = booking.payloads.find((p) => p.action === "ON_ACCOUNT_LINK")!;
    booking.shift(early.payloadId!, -1_500); // recorded before account_link itself
    const report = await generateFdReport(reportInput(sessions), deps(booking));

    const eligibility = report.sla!.deadlines.find((d) => d.flowId === "fd_booking" && d.request === "eligibility_check")!;
    expect(eligibility).toMatchObject({ verdict: "FAIL", elapsedMs: 32000 });
    const link = report.sla!.deadlines.find((d) => d.flowId === "fd_booking" && d.request === "account_link")!;
    expect(link).toMatchObject({ verdict: "PASS", elapsedMs: 0, recordedBeforeRequest: true });
    expect(link.detail).toMatch(/recorded before its request/);
    expect(report.summary!.findings.filter((f) => f.rule === "sla.callback-deadline").map((f) => f.action)).toEqual(["eligibility_check"]);
    expect(report.certificate!.decision).toBe("REFUSED");
  });
});

describe("a full BOOKING certification run of the investor app", () => {
  it("is VALID with every plan flow: the app answers no SYNC route and owes no callback, so no SLA binds it", async () => {
    const sessions = await certificationRun("BAP");
    const report = await generateFdReport(reportInput(sessions), deps(sessions[0]!));
    expect(report.certification!.flows.map((f) => [f.planFlowId, f.sessionFlowId, f.status])).toEqual([
      ["fd_booking", "fd_booking", "JUDGED"],
      ["fd_scn_12", "fd_redelivered_booking", "JUDGED"],
      ["fd_scn_34", "fd_stale_version", "JUDGED"],
      ["fd_scn_38", "fd_out_of_order", "JUDGED"],
      ["fd_scn_6", "fd_quote_expired", "JUDGED"],
    ]);
    expect(report.sla).toMatchObject({ answerTimes: [], deadlines: [], certifiable: true });
    expect(report.summary!.findings).toEqual([]);
    expect(evaluateIssuance(report.summary!)).toEqual({ decision: "PASS", reasons: [] });
    expect(generateFdHTMLReport(report).html).toContain("No SYNC route the NP answers is in scope");
  });
});

describe("the capability declaration", () => {
  it("defaults to BOOKING only when the session has none", () => {
    expect(declarationOf({ domain: "ONDC:FIS14:FD", flowConfigs: {}, usecaseId: "FIXED DEPOSIT" })).toEqual({ source: "default", declaration: { actionGroups: ["BOOKING"] } });
    expect(declarationOf(undefined).source).toBe("default");
  });

  it("is read from the session's capabilityDeclaration, as an object or JSON, and widens the plan", async () => {
    const declaration = { actionGroups: ["BOOKING", "GRIEVANCE"] };
    expect(declarationOf({ capabilityDeclaration: JSON.stringify(declaration) })).toEqual({ source: "session", declaration });
    const session = await (await Session.create("BAP")).book();
    const input = reportInput([session]);
    input.sessionDetails.capabilityDeclaration = declaration;
    const report = await generateFdReport(input, { loadSources: sources, keyLookup: session.keyLookup });
    expect(report.certification!.declaration).toEqual({ source: "session", declaration });
    expect(report.certification!.plan!.actionGroups).toEqual(["BOOKING", "GRIEVANCE"]);
    expect(report.coverage["FD-GRV-01"]).toEqual({ status: "NOT_COVERED", scenarios: [], evidence: [] });
    expect(generateFdHTMLReport(report).html).toContain("from the session");
  });

  it("an unreadable or contradictory declaration is a blocker", async () => {
    expect(declarationOf({ capabilityDeclaration: "{not json" }).problem).toMatch(/is not JSON/);
    expect(declarationOf({ capabilityDeclaration: { actionGroups: "BOOKING" } }).problem).toMatch(/actionGroups that are not a list/);

    const session = await (await Session.create("BAP")).book({}, "quote_request");
    const unknown = reportInput([session]);
    unknown.sessionDetails.capabilityDeclaration = { actionGroups: ["BOOKING", "LENDING"] };
    const refused = await generateFdReport(unknown, { loadSources: sources, keyLookup: session.keyLookup });
    expect(refused.certification!.plan).toBeUndefined();
    expect(refused.certification!.planError).toMatch(/unknown action group\(s\) LENDING/);
    expect(refused.summary!.findings.some((f) => f.rule === "certification.plan" && /could not be computed/.test(f.detail))).toBe(true);
    expect(refused.fullRun.full).toBe(false);
    expect(refused.certificate!.decision).toBe("REFUSED");

    const contradictory = reportInput([session]);
    contradictory.sessionDetails.capabilityDeclaration = { actionGroups: ["BOOKING", "SERVICING"] };
    const problem = await generateFdReport(contradictory, { loadSources: sources, keyLookup: session.keyLookup });
    expect(problem.certification!.plan!.declarationProblems).toEqual(["SERVICING is declared, but capabilities.servicingActionsSupported lists no servicing action"]);
    expect(problem.summary!.findings.map((f) => f.detail)).toContain("plan: declaration: SERVICING is declared, but capabilities.servicingActionsSupported lists no servicing action");
    expect(problem.certificate!.decision).toBe("REFUSED");
  });
});
