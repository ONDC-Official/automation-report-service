/**
 * The adapter (src/fd/engine.ts) is the only way to the engine. It loads the package lazily and
 * fails closed, with a named error, when the package cannot be loaded or set up.
 */
import { FdEngineUnavailableError, loadFdContract, prepareFdJudgeKit, setFdContractLoaderForTests } from "../engine";
import { SPEC_TEXT, TABLE } from "./journey";

afterEach(() => setFdContractLoaderForTests(null));

describe("the FD engine adapter", () => {
  it("does not load the package until an FD report needs it", () => {
    let loads = 0;
    setFdContractLoaderForTests(() => {
      loads++;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("@ondc/fd-contract");
    });
    expect(loads).toBe(0);
    loadFdContract();
    loadFdContract();
    expect(loads).toBe(1);
  });

  it("fails closed with a named error when require fails", () => {
    setFdContractLoaderForTests(() => {
      throw new Error("Cannot find module '@ondc/fd-contract'");
    });
    expect(() => loadFdContract()).toThrow(FdEngineUnavailableError);
    expect(() => loadFdContract()).toThrow(/Cannot find module/);
  });

  it("fails closed when the package lacks an export the judge needs", () => {
    setFdContractLoaderForTests(() => ({ createEngine: () => ({}) }));
    expect(() => loadFdContract()).toThrow(/does not export loadRouteTable/);
  });

  it("fails closed on a route table whose hash does not match", () => {
    const tampered = { ...TABLE, tableHash: "0".repeat(64) };
    expect(() => prepareFdJudgeKit({ spec: SPEC_TEXT, routes: tampered })).toThrow(FdEngineUnavailableError);
  });

  it("reports the table's hash and the engine's version", () => {
    const kit = prepareFdJudgeKit({ spec: SPEC_TEXT, routes: TABLE });
    expect(kit.tableHash).toBe(TABLE.tableHash);
    expect(kit.domain).toBe("ONDC:FIS14:FD");
    expect(kit.version).toBe("0.1.4");
    expect(kit.contractVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(kit.requirements.requirementsFor("on_application_confirm", { inheritFromRequest: true })).toContain("FD-PRD-10");
  });

  it("creates an issuer-role engine for judging without a signing key", () => {
    const kit = prepareFdJudgeKit({ spec: SPEC_TEXT, routes: TABLE });
    const engine = kit.createEngine({
      role: "DEPOSIT_ISSUER",
      identity: { subscriberId: "fd.examplebank.in", subscriberUri: "https://fd.examplebank.in/fd/v0.1" },
      clock: () => new Date(),
    });
    expect(engine.initialState("6a0b6b2e-64c4-4c8a-9b2a-3f6f1c2d55aa").transactionId).toBe("6a0b6b2e-64c4-4c8a-9b2a-3f6f1c2d55aa");
  });
});
