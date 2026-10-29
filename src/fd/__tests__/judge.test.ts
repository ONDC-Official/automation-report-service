/**
 * The FD judge on recorded sessions the engine itself produced (journey.ts): a clean booking
 * passes with either participant under test; every break fails the flow closed, with findings
 * tied to requirement IDs.
 */
import { judgeFdFlow, FdFlowVerdict } from "../judge";
import { FdJudgeKit } from "../engine";
import { judgeKit, Session } from "./journey";

let kit: FdJudgeKit;
beforeAll(() => {
  kit = judgeKit();
});

async function judged(session: Session, steps = session.steps): Promise<FdFlowVerdict> {
  return judgeFdFlow(session.payloads, {
    flowId: "fd_booking",
    transactionId: "6a0b6b2e-64c4-4c8a-9b2a-3f6f1c2d55aa",
    npType: session.npType,
    kit,
    steps,
    keyLookup: session.keyLookup,
  });
}

const rules = (v: FdFlowVerdict) => v.findings.map((f) => f.rule);
const summary = (v: FdFlowVerdict) => v.findings.map((f) => `${f.rule} [${f.requirementIds.join(",")}] ${f.detail}`);

describe("a clean booking journey", () => {
  it.each(["BAP", "BPP"] as const)("passes with the NP as %s", async (npType) => {
    const session = await (await Session.create(npType)).book();
    const verdict = await judged(session);
    expect(summary(verdict)).toEqual([]);
    expect(verdict.verdict).toBe("PASS");
    expect(verdict.reasons).toEqual([]);
    expect(verdict.exchanges.every((e) => e.judged)).toBe(true);
    expect(verdict.exchanges.length).toBe(session.payloads.length);
    // Requirements were exercised, with message ids as evidence.
    expect(verdict.exercised["FD-IDN-06"]?.length).toBeGreaterThan(0);
    expect(verdict.exercised["FD-PRD-10"]?.length).toBeGreaterThan(0);
    expect(verdict.startedAt && verdict.finishedAt && verdict.startedAt <= verdict.finishedAt).toBe(true);
  });

  it("passes when a callback was recorded just before the request it answers", async () => {
    const session = await (await Session.create("BAP")).book();
    const create = session.payloads.find((p) => p.action === "APPLICATION_CREATE")!;
    const callback = session.payloads.find((p) => p.action === "ON_APPLICATION_CREATE")!;
    [create.createdAt, callback.createdAt] = [callback.createdAt, create.createdAt];
    const verdict = await judged(session);
    expect(summary(verdict)).toEqual([]);
    expect(verdict.verdict).toBe("PASS");
  });
});

/** Every finding names at least one requirement ID, so the report can group it. */
function expectTraced(verdict: FdFlowVerdict, rule: string, requirementId?: string): void {
  const hits = verdict.findings.filter((f) => f.rule === rule);
  expect(hits.length).toBeGreaterThan(0);
  for (const f of hits) {
    expect(f.requirementIds.length).toBeGreaterThan(0);
    if (requirementId) expect(f.requirementIds).toContain(requirementId);
    expect(f.messageId ?? f.payloadId).toBeTruthy();
  }
}

describe("a broken issuer (the NP is the issuer)", () => {
  it("fails on a broken version bump, citing FD-IDN-06", async () => {
    const session = await (await Session.create("BPP")).book(
      { eligibility_check: { answerScenario: { mutate: ["$.message.application.version=1", "$.fdEnvelope.correlation.applicationVersion=1"] } } },
      "eligibility_check"
    );
    const verdict = await judged(session);
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict)).toEqual(expect.arrayContaining(["issuer.version-increment", "issuer.version-not-incremented"]));
    expectTraced(verdict, "issuer.version-increment", "FD-IDN-06");
    expect(verdict.findings.every((f) => f.source === "engine")).toBe(true);
  });

  it("fails on a wrong quote digest", async () => {
    const session = await (await Session.create("BPP")).book(
      { quote_request: { answerScenario: { mutate: ['$.message.quote.termsDigest.value="AAAA"'] } } },
      "quote_request"
    );
    const verdict = await judged(session);
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict)).toContain("quote.digest");
    expectTraced(verdict, "quote.digest", "FD-PRD-10");
  });

  it("fails on a new response to a replayed request", async () => {
    const session = await (await Session.create("BPP")).book({}, "quote_request");
    // The workbench retries quote_request (same message_id, same body); the issuer quotes afresh.
    await session.request("quote_request", { requestScenario: { retry: true } });
    const verdict = await judged(session);
    expect(verdict.verdict).toBe("FAIL");
    expectTraced(verdict, "issuer.replay-response", "DP-13");
  });

  it("fails on an unanswered callback: the callback is missing, and so is the step's evidence", async () => {
    const session = await (await Session.create("BPP")).book({ eligibility_check: { dropCallback: true } }, "eligibility_check");
    const verdict = await judged(session);
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict).sort()).toEqual(["judge.callback-missing", "judge.missing-evidence"]);
    expectTraced(verdict, "judge.callback-missing", "FD-KYC-05");
    const missing = verdict.findings.find((f) => f.rule === "judge.missing-evidence")!;
    expect(missing.detail).toMatch(/on_eligibility_check_1/);
    expect(missing.requirementIds).toContain("FD-KYC-05"); // the callback answers for eligibility_check's requirements
  });

  it("fails when the issuer NACKs a request it had to accept", async () => {
    const nack = (ack: any) => ({
      body: {
        context: ack.context,
        message: { ack: { status: "NACK" } },
        error: { code: "FD-PWB-0040", class: "PROTOCOL", reason: "FIELD_CONSTRAINT_VIOLATED", message: "no", obligedParty: "N-01 INVESTOR_APP", retryable: false, fieldPath: "/message" },
      },
      status: 200,
    });
    const session = await (await Session.create("BPP")).book({ party_submit: { requestAnswer: nack, dropCallback: true } }, "party_submit");
    const verdict = await judged(session, session.steps.filter((s) => s.action !== "on_party_submit"));
    expect(verdict.verdict).toBe("FAIL");
    // The engine, as investor app, judges the refusal; the judge adds nothing it already said.
    expect(rules(verdict)).toContain("issuer.unexpected-refusal");
    expect(rules(verdict)).not.toContain("judge.np-nack");
  });
});

describe("a broken investor app (the NP is the app)", () => {
  it("fails on a wrong digest: the engine's finding, and the workbench's refusal", async () => {
    const session = await (await Session.create("BAP")).book({ application_confirm: { requestScenario: { wrongDigest: true } } }, "application_confirm");
    const verdict = await judged(session);
    expect(verdict.verdict).toBe("FAIL");
    const digest = verdict.findings.find((f) => f.rule === "journey.quote-digest")!;
    expect(digest).toBeDefined();
    expect(digest.errorCode).toBe("FD-PRODUCT-0011");
    expect(digest.requirementIds).toContain("FD-PRD-10");
    expect(rules(verdict)).toContain("judge.workbench-refused");
  });

  it("fails when the app NACKs a callback it had to accept", async () => {
    const nack = (ack: any) => ({
      body: { context: ack.context, message: { ack: { status: "NACK" } }, error: { code: "FD-PROTOCOL-0012", class: "PROTOCOL", message: "refused" } },
      status: 200,
    });
    const session = await (await Session.create("BAP")).book({ application_create: { callbackAnswer: nack } }, "application_create");
    const verdict = await judged(session);
    expect(verdict.verdict).toBe("FAIL");
    expectTraced(verdict, "judge.np-nack", "FD-IDN-03");
  });

  it("fails when the workbench refused the app's message with an FD-PWB NACK", async () => {
    const refused = (ack: any) => ({
      body: {
        context: ack.context,
        message: { ack: { status: "NACK" } },
        error: { code: "FD-PWB-0030", class: "PROTOCOL", reason: "FIELD_CONSTRAINT_VIOLATED", message: "schema", obligedParty: "N-01 INVESTOR_APP", retryable: false, fieldPath: "" },
      },
      status: 200,
    });
    const session = await (await Session.create("BAP")).book({ eligibility_check: { requestAnswer: refused, dropCallback: true } }, "eligibility_check");
    const verdict = await judged(session, session.steps.filter((s) => s.action !== "on_eligibility_check"));
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict)).toEqual(["judge.workbench-refused"]);
    expect(verdict.findings[0]!.detail).toMatch(/FD-PWB-0030/);
  });

  it("fails when an ACK travels with the wrong HTTP status or does not echo the context", async () => {
    const wrong = (ack: any) => ({ body: { ...ack, context: { ...ack.context, bpp_id: "someone.else.in" } }, status: 202 });
    const session = await (await Session.create("BAP")).book({ application_create: { callbackAnswer: wrong } }, "application_create");
    const verdict = await judged(session);
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict)).toEqual(expect.arrayContaining(["http.status", "judge.ack-echo"]));
    // A callback declares no requirements; its findings carry its request's.
    expectTraced(verdict, "http.status", "FD-IDN-03");
  });

  it("fails when the recorded REST call is another route", async () => {
    const session = await (await Session.create("BAP")).book({}, "eligibility_check");
    const p = session.payloads.find((x) => x.action === "ELIGIBILITY_CHECK")!;
    const headers = JSON.parse(String(p.reqHeader));
    headers["X-Pwb-Fd-Path"] = ["/applications/APP-1/parties"];
    p.reqHeader = JSON.stringify(headers);
    const verdict = await judged(session);
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict)).toEqual(["judge.rest-call"]);

    // Without fd-gate's route header, the REST call is the route, and the body's action must match it.
    delete headers["X-Pwb-Fd-Route"];
    p.reqHeader = JSON.stringify(headers);
    const again = await judged(session);
    expect(again.verdict).toBe("FAIL");
    expect(rules(again)).toContain("context.action-matches-route");
  });
});

describe("fail-closed", () => {
  it("an engine error fails the flow, and nothing after it counts as evidence", async () => {
    const session = await (await Session.create("BAP")).book();
    let calls = 0;
    const broken: FdJudgeKit = {
      ...kit,
      createEngine(opts) {
        const engine = kit.createEngine(opts);
        return {
          ...engine,
          async observe(state, inbound) {
            if (++calls === 3) throw new Error("boom");
            return engine.observe(state, inbound);
          },
        };
      },
    };
    const verdict = await judgeFdFlow(session.payloads, { flowId: "fd_booking", npType: "BAP", kit: broken, steps: session.steps });
    expect(verdict.verdict).toBe("FAIL");
    expect(verdict.engineError).toMatch(/boom/);
    expect(rules(verdict)).toEqual(["judge.engine-error"]);
    expect(verdict.exchanges.filter((e) => e.judged).length).toBe(2);
    expect(verdict.exchanges.slice(2).every((e) => !e.judged)).toBe(true);
    expect(verdict.exercised["FD-PRD-12"]).toBeDefined(); // quote_request, judged before the error
    expect(verdict.exercised["FD-KYC-05"]).toBeUndefined(); // eligibility_check, after it
  });

  it("an engine that cannot be created fails the flow", async () => {
    const session = await (await Session.create("BAP")).book({}, "quote_request");
    const broken: FdJudgeKit = {
      ...kit,
      createEngine() {
        throw new Error("no engine");
      },
    };
    const verdict = await judgeFdFlow(session.payloads, { flowId: "fd_booking", npType: "BAP", kit: broken });
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict)).toEqual(["judge.engine-error"]);
  });

  it("a flow with no recorded message fails", async () => {
    const verdict = await judgeFdFlow([], { flowId: "fd_booking", npType: "BAP", kit, steps: [{ action: "quote_request", actionId: "quote_request_1", payloadIds: [] }] });
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict).sort()).toEqual(["judge.missing-evidence", "judge.no-evidence"]);
  });

  it("a step whose payload was not recorded fails, even when everything recorded is right", async () => {
    const session = await (await Session.create("BAP")).book();
    const steps = [...session.steps, { action: "deposit_read", actionId: "deposit_read_2", payloadIds: ["p-missing"] }];
    const verdict = await judged(session, steps);
    expect(verdict.verdict).toBe("FAIL");
    expect(rules(verdict)).toEqual(["judge.missing-evidence"]);
    expect(verdict.findings[0]!.requirementIds).toContain("FD-MOD-09");
  });
});
