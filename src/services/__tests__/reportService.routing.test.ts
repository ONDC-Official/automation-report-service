/**
 * reportService routes by domain: a Beckn session takes exactly the path it took before (the
 * Beckn validators and template, or Pramaan); an FD session goes to the FD module and never to
 * Pramaan. Loading the service never loads the FD engine.
 */
jest.mock("../dbService");
jest.mock("../cacheService", () => ({ CacheService: { set: jest.fn().mockResolvedValue(undefined), get: jest.fn() } }));
jest.mock("../validationModule", () => ({ validationModule: jest.fn().mockResolvedValue({ finalReport: {}, flowErrors: {} }) }));
jest.mock("../../templates/generateReport", () => ({ generateCustomHTMLReport: jest.fn(() => ({ html: "<beckn/>", flowResults: { F1: "PASS" } })) }));
jest.mock("../../fd/report", () => ({ generateFdReport: jest.fn() }));
jest.mock("../../templates/generateFdReport", () => ({ generateFdHTMLReport: jest.fn(() => ({ html: "<fd/>", flowResults: { fd_booking: "FAIL" } })) }));
jest.mock("../../utils/payloadUtils", () => ({ generateTestsFromPayloads: jest.fn().mockResolvedValue({ tests: [], subscriber_id: "np" }) }));
jest.mock("axios");

import axios from "axios";
import { fetchPayloads, fetchSessionDetails } from "../dbService";
import { validationModule } from "../validationModule";
import { generateCustomHTMLReport } from "../../templates/generateReport";
import { generateFdReport } from "../../fd/report";
import { ReportService } from "../reportService";

const mocked = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mocked(axios.get).mockResolvedValue({ data: { sequence: [] } });
  mocked(axios.post).mockResolvedValue({ data: { message: { ack: { status: "ACK" } } } });
  mocked(fetchPayloads).mockResolvedValue({ F1: [] });
});

describe("ReportService.generate routing", () => {
  it("keeps a Beckn session on the Beckn validators and template", async () => {
    mocked(fetchSessionDetails).mockResolvedValue({ domain: "ONDC:TRV11", version: "2.1.0", usecaseId: "metro", npType: "BAP", flowMap: { F1: "t1" } });
    const out = await new ReportService().generate("s1", { F1: [] });
    expect(out).toEqual({ html: "<beckn/>", flowResults: { F1: "PASS" } });
    expect(validationModule).toHaveBeenCalledTimes(1);
    expect(generateCustomHTMLReport).toHaveBeenCalledTimes(1);
    expect(generateFdReport).not.toHaveBeenCalled();
  });

  it("keeps a Beckn domain that is not enabled on Pramaan", async () => {
    process.env.PRAMAAN_URL = "http://pramaan.local/run";
    mocked(fetchSessionDetails).mockResolvedValue({ domain: "ONDC:RET10", version: "1.2.5", usecaseId: "x", npType: "BAP", flowMap: { F1: "t1" } });
    await new ReportService().generate("s1", { F1: [] });
    expect(mocked(axios.post).mock.calls.some(([url]) => url === "http://pramaan.local/run")).toBe(true);
    expect(generateFdReport).not.toHaveBeenCalled();
    expect(validationModule).not.toHaveBeenCalled();
  });

  it.each([
    ["0.1.4", true],
    ["0.1.5", false],
  ])("sends an FD %s session to the FD module (enabled: %s), never to Pramaan", async (version, enabled) => {
    process.env.PRAMAAN_URL = "http://pramaan.local/run";
    mocked(fetchSessionDetails).mockResolvedValue({ domain: "ONDC:FIS14:FD", version, npType: "BAP", flowMap: { fd_booking: "t1" } });
    mocked(generateFdReport).mockResolvedValue({ flows: [] });
    const out = await new ReportService().generate("s1", { fd_booking: [] });
    expect(out).toEqual({ html: "<fd/>", flowResults: { fd_booking: "FAIL" } });
    expect(mocked(generateFdReport).mock.calls[0]![0]).toMatchObject({ sessionId: "s1", requestedFlows: ["fd_booking"], enabled });
    expect(validationModule).not.toHaveBeenCalled();
    expect(generateCustomHTMLReport).not.toHaveBeenCalled();
    expect(mocked(axios.post).mock.calls.some(([url]) => url === "http://pramaan.local/run")).toBe(false);
  });
});

describe("loading the service", () => {
  it("does not load @ondc/fd-contract", () => {
    let loaded = false;
    jest.isolateModules(() => {
      jest.doMock("@ondc/fd-contract", () => {
        loaded = true;
        return {};
      });
      jest.unmock("../../fd/report");
      jest.unmock("../../templates/generateFdReport");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../reportService");
    });
    expect(loaded).toBe(false);
  });
});
