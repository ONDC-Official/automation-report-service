/**
 * The FD report: coverage over a run, the certificate hand-off, the fail-closed report when the
 * engine cannot be loaded, and the HTML section.
 */
import axios from "axios";
import { setFdContractLoaderForTests } from "../engine";
import { evaluateIssuance } from "../certificate";
import { FdReportInput, generateFdReport } from "../report";
import { generateFdHTMLReport } from "../../templates/generateFdReport";
import { BOOKING_PLAN_FLOWS, certificationRun, reportInput, SPEC_TEXT, Session, TABLE, TXN } from "./journey";

const sources = async () => ({ spec: SPEC_TEXT, routes: TABLE });

/** The session as reportService hands it over: payloads per flow, and the playground's flow state. */
function inputFor(session: Session, over: Partial<FdReportInput> = {}, steps = session.steps): FdReportInput {
  return {
    sessionId: "session-fd-1",
    sessionDetails: { domain: "ONDC:FIS14:FD", version: "0.1.4", npType: session.npType, flowMap: { fd_booking: TXN }, flowConfigs: { fd_booking: {} } },
    flows: { fd_booking: session.payloads },
    currentStates: {
      fd_booking: {
        sequence: steps.map((s, index) => ({
          index,
          actionId: s.actionId,
          actionType: s.action,
          status: s.status,
          payloads: { entryType: "API", action: s.action, payloads: s.payloadIds.map((payloadId) => ({ payloadId })) },
        })),
      },
    },
    flowMap: { fd_booking: TXN },
    requestedFlows: ["fd_booking"],
    enabled: true,
    ...over,
  };
}

const ENV = ["FD_CERTIFY", "AUTOMATION_DB_BASE_URL", "AUTOMATION_DB_API_KEY"] as const;
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
  setFdContractLoaderForTests(null);
  jest.restoreAllMocks();
});

describe("generateFdReport", () => {
  it("judges a clean booking: PASS, with coverage over the BOOKING plan, and would refuse a certificate for what it did not run", async () => {
    const session = await (await Session.create("BAP")).book();
    const report = await generateFdReport(inputFor(session), { loadSources: sources, keyLookup: session.keyLookup });
    expect(report.error).toBeUndefined();
    expect(report.verdict).toBe("PASS");
    expect(report.flows.map((f) => [f.flowId, f.verdict])).toEqual([["fd_booking", "PASS"]]);
    expect(report.npRole).toBe("INVESTOR_APP");
    expect(report.workbenchRole).toBe("DEPOSIT_ISSUER");
    expect(report.tableHash).toBe(TABLE.tableHash);

    // No declaration in the session: BOOKING only, and coverage is exactly the plan's requirement IDs.
    const scope = report.certification!;
    expect(scope.declaration).toEqual({ source: "default", declaration: { actionGroups: ["BOOKING"] } });
    expect(scope.plan!.actionGroups).toEqual(["BOOKING"]);
    expect(Object.keys(report.coverage)).toEqual(scope.plan!.requirementIds);

    // Exercised requirements PASS with scenario and evidence; the rest are NOT_COVERED.
    const idn = report.coverage["FD-IDN-06"]!;
    expect(idn.status).toBe("PASS");
    expect(idn.scenarios).toEqual(["fd_booking"]);
    expect(idn.evidence.length).toBeGreaterThan(0);
    expect(report.coverage["FD-CON-05"]).toEqual({ status: "NOT_COVERED", scenarios: [], evidence: [] }); // consent_withdraw: its flow is not deployed here
    expect(report.coverage["FD-GRV-01"]).toBeUndefined(); // GRIEVANCE is not declared
    expect(report.coverage["FD-PAR-03"]).toBeUndefined(); // nor is DISCOVERY
    expect(Object.values(report.coverage).some((e) => e.status === "FAIL")).toBe(false);

    // The session's configuration has fd_booking only, so the plan's scenario flows are missing.
    expect(scope.flows.map((f) => [f.flowId, f.status])).toEqual(BOOKING_PLAN_FLOWS.BAP.map((id) => [id, id === "fd_booking" ? "JUDGED" : "NOT_IN_SESSION"]));
    expect(report.fullRun.full).toBe(false);

    // The run summary, as automation-db's POST /certificates expects it.
    const summary = report.summary!;
    expect(summary).toMatchObject({
      subscriberId: "fd.exampledistributor.in",
      role: "INVESTOR_APP",
      domain: "ONDC:FIS14:FD",
      version: "0.1.4",
      tableHash: TABLE.tableHash,
      waivers: [],
    });
    // No judge finding; only the run's blockers, which cite no requirement ID (no waiver covers them).
    expect(summary.findings.every((f) => f.requirementIds.length === 0)).toBe(true);
    expect([...new Set(summary.findings.map((f) => f.rule))].sort()).toEqual(["certification.missing-flow", "certification.plan"]);
    expect(Object.keys(summary.toolVersions).sort()).toEqual(["automation-report-service", "fd-contract"]);
    expect(summary.runs).toHaveLength(1);
    expect(summary.runs[0]).toMatchObject({ sessionId: "session-fd-1", flowId: "fd_booking", transactionId: TXN });
    expect(summary.runs[0]!.startedAt <= summary.runs[0]!.finishedAt).toBe(true);
    expect(summary.coverage).toBe(report.coverage);

    // Not a certification deployment: nothing is sent, and the decision is shown.
    expect(report.certificate!.sent).toBe(false);
    expect(report.certificate!.decision).toBe("REFUSED");
    expect(report.certificate!.reasons).toContain("FD-CON-05: NOT_COVERED");
    expect(report.certificate!.notSent).toEqual(expect.arrayContaining(["FD_CERTIFY is not true"]));

    const { html, flowResults } = generateFdHTMLReport(report);
    expect(flowResults).toEqual({ fd_booking: "PASS" });
    expect(html).toContain("FD Protocol Report");
    expect(html).toContain("Would issue");
    expect(html).toContain("REFUSED");
    expect(html).toContain("FD-IDN-06");
    expect(html).toContain("Certification plan");
    expect(html).toContain("BOOKING only");
  });

  it("scopes coverage to the issuer's routes when the NP is the issuer", async () => {
    const session = await (await Session.create("BPP")).book();
    const report = await generateFdReport(inputFor(session), { loadSources: sources, keyLookup: session.keyLookup });
    expect(report.verdict).toBe("PASS");
    expect(report.summary).toMatchObject({ role: "DEPOSIT_ISSUER", subscriberId: "fd.examplebank.in" });
    expect(report.certification!.plan!.role).toBe("DEPOSIT_ISSUER");
    expect(report.coverage["FD-PAR-03"]).toBeUndefined(); // discovery_capability_read goes to the INDEX
    expect(report.coverage["FD-GRV-01"]).toBeUndefined();
    expect(report.coverage["FD-CON-05"]?.status).toBe("NOT_COVERED");
  });

  it("missing evidence fails the flow, and its requirements are FAIL or NOT_COVERED", async () => {
    const session = await (await Session.create("BAP")).book();
    const read = session.payloads.find((p) => p.action === "DEPOSIT_READ")!;
    const input = inputFor(session, { flows: { fd_booking: session.payloads.filter((p) => p !== read) } });
    const report = await generateFdReport(input, { loadSources: sources, keyLookup: session.keyLookup });
    expect(report.verdict).toBe("FAIL");
    expect(report.flows[0]!.findings.map((f) => f.rule)).toEqual(["judge.missing-evidence"]);
    // deposit_read's in-scope requirements: cited by the finding, so FAIL, never PASS.
    expect(report.coverage["FD-MOD-09"]?.status).toBe("FAIL");
    expect(report.coverage["FD-MOD-09"]?.scenarios).toEqual(["fd_booking"]);
    // FD-MOD-10 (SERVICING) is outside the BOOKING plan: not in coverage, but the finding stays.
    expect(report.coverage["FD-MOD-10"]).toBeUndefined();
    expect(report.summary!.findings.find((f) => f.rule === "judge.missing-evidence")?.requirementIds).toContain("FD-MOD-10");
    expect(report.certificate!.decision).toBe("REFUSED");
    expect(generateFdHTMLReport(report).flowResults).toEqual({ fd_booking: "FAIL" });
  });

  it("fails closed when the flow's state cannot be read", async () => {
    const session = await (await Session.create("BAP")).book();
    const report = await generateFdReport(inputFor(session, { currentStates: { fd_booking: null } }), { loadSources: sources, keyLookup: session.keyLookup });
    expect(report.verdict).toBe("FAIL");
    expect(report.flows[0]!.findings.map((f) => f.rule)).toContain("judge.missing-evidence");
  });

  it("fails closed, naming the cause, when the engine cannot be loaded", async () => {
    setFdContractLoaderForTests(() => {
      throw new Error("Cannot find module '@ondc/fd-contract'");
    });
    const session = await (await Session.create("BAP")).book({}, "quote_request");
    const report = await generateFdReport(inputFor(session), { loadSources: sources });
    expect(report.verdict).toBe("FAIL");
    expect(report.error).toMatch(/FD engine \(@ondc\/fd-contract\) is unavailable/);
    expect(report.flows.map((f) => [f.flowId, f.verdict, f.findings[0]?.rule])).toEqual([["fd_booking", "FAIL", "judge.engine-unavailable"]]);
    expect(report.certificate).toBeUndefined();
    const { html, flowResults } = generateFdHTMLReport(report);
    expect(flowResults).toEqual({ fd_booking: "FAIL" });
    expect(html).toContain("is unavailable");
  });

  it("fails closed for an FD version that is not enabled, and for a missing spec", async () => {
    const session = await (await Session.create("BAP")).book({}, "quote_request");
    const disabled = await generateFdReport(inputFor(session, { enabled: false }), { loadSources: sources });
    expect(disabled.verdict).toBe("FAIL");
    expect(disabled.error).toMatch(/not an enabled FD version/);

    const noSpec = await generateFdReport(inputFor(session), {
      loadSources: async () => {
        throw new Error("[FD] FD_SPEC is not set: point it at the FD OpenAPI YAML");
      },
    });
    expect(noSpec.verdict).toBe("FAIL");
    expect(noSpec.error).toMatch(/FD_SPEC is not set/);
  });

  it("escapes what a participant sent", async () => {
    const session = await (await Session.create("BAP")).book({}, "quote_request");
    const p = session.payloads[0]!;
    (p.jsonRequest as any).context.action = "<script>alert(1)</script>";
    const report = await generateFdReport(inputFor(session), { loadSources: sources });
    const { html } = generateFdHTMLReport(report);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("the certificate hand-off", () => {
  function certifying(): void {
    process.env.FD_CERTIFY = "true";
    process.env.AUTOMATION_DB_BASE_URL = "http://automation-db.local/";
    process.env.AUTOMATION_DB_API_KEY = "db-key";
  }

  it("posts the run summary to automation-db when certifying a full run", async () => {
    certifying();
    const post = jest.spyOn(axios, "post").mockResolvedValue({
      status: 201,
      data: { certificate: { certificateId: "cert-1", status: "VALID", verdict: "PASS" }, reasons: [] },
    });
    const sessions = await certificationRun("BAP");
    const report = await generateFdReport(reportInput(sessions), { loadSources: sources, keyLookup: sessions[0]!.keyLookup });
    expect(report.fullRun).toEqual({ full: true, notFull: [] });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0]!;
    expect(url).toBe("http://automation-db.local/certificates");
    expect((config as any).headers["x-api-key"]).toBe("db-key");
    expect(Object.keys(body as object).sort()).toEqual(
      ["coverage", "domain", "findings", "role", "runs", "subscriberId", "tableHash", "toolVersions", "version", "waivers"].sort()
    );
    expect((body as any).runs).toHaveLength(8);
    expect(report.certificate).toMatchObject({ decision: "PASS", sent: true, response: { certificateId: "cert-1", status: "VALID", verdict: "PASS" } });
    expect(generateFdHTMLReport(report).html).toContain("cert-1");
  });

  it("does not post when the report is not a full run, or automation-db is not configured", async () => {
    const post = jest.spyOn(axios, "post");
    const session = await (await Session.create("BAP")).book({}, "quote_request");
    certifying();
    const partial = inputFor(session);
    partial.sessionDetails = { ...partial.sessionDetails, flowConfigs: { fd_booking: {}, fd_withdrawal: {} } };
    const report = await generateFdReport(partial, { loadSources: sources, keyLookup: session.keyLookup });
    const missing = BOOKING_PLAN_FLOWS.BAP.filter((f) => f !== "fd_booking").map((f) => `flow ${f} is not a flow of this session`);
    expect(report.fullRun).toEqual({ full: false, notFull: missing });
    expect(report.certificate).toMatchObject({ sent: false, notSent: missing });

    const sessions = await certificationRun("BAP");
    delete process.env.AUTOMATION_DB_API_KEY;
    const unconfigured = await generateFdReport(reportInput(sessions), { loadSources: sources, keyLookup: sessions[0]!.keyLookup });
    expect(unconfigured.fullRun.full).toBe(true);
    expect(unconfigured.certificate!.notSent).toEqual(["AUTOMATION_DB_API_KEY is not set"]);
    expect(post).not.toHaveBeenCalled();
  });

  it("reports a failed POST as no certificate", async () => {
    certifying();
    jest.spyOn(axios, "post").mockRejectedValue(new Error("connect ECONNREFUSED"));
    const sessions = await certificationRun("BAP");
    const report = await generateFdReport(reportInput(sessions), { loadSources: sources, keyLookup: sessions[0]!.keyLookup });
    expect(report.certificate).toMatchObject({ sent: false });
    expect(report.certificate!.error).toMatch(/ECONNREFUSED/);
  });
});

describe("evaluateIssuance (automation-db's rule, shown in the report)", () => {
  const pass = { status: "PASS" as const, scenarios: ["fd_booking"], evidence: ["m-1"] };
  it("passes only full coverage with no finding", () => {
    expect(evaluateIssuance({ coverage: { "FD-PRD-10": pass }, findings: [], waivers: [] })).toEqual({ decision: "PASS", reasons: [] });
  });
  it("refuses empty coverage, NOT_COVERED, a PASS without evidence, and any unwaived finding", () => {
    expect(evaluateIssuance({ coverage: {}, findings: [], waivers: [] }).decision).toBe("REFUSED");
    expect(evaluateIssuance({ coverage: { a: { status: "NOT_COVERED", scenarios: [], evidence: [] } }, findings: [], waivers: [] }).reasons).toEqual(["a: NOT_COVERED"]);
    expect(evaluateIssuance({ coverage: { a: { ...pass, evidence: [] } }, findings: [], waivers: [] }).reasons).toEqual(["a: PASS cites no evidence"]);
    const finding = { requirementIds: [], rule: "context.transaction", detail: "x" };
    expect(evaluateIssuance({ coverage: { a: pass }, findings: [finding], waivers: [] }).reasons[0]).toMatch(/cites no requirement ID/);
  });
});
