/**
 * Pins the Beckn HTML report byte for byte. The FD work adds its own report module and leaves
 * this template alone; if this snapshot changes, a Beckn report changed.
 *
 * It also pins today's Beckn verdict rule on purpose: a flow whose sequence is valid is PASS even
 * when some of its checks failed (generateReport.ts, flowResults). FD does not use this rule.
 */
import { generateCustomHTMLReport } from "../generateReport";
import { Report } from "../../types/payload";

const report: Report = {
  finalReport: {
    mandatoryFlows: "TECHNICAL_CANCELLATION_FLOW is/are mandatory and should be tested.",
  },
  flowErrors: {
    STATION_CODE_FLOW: {
      valid_flow: true,
      errors: [],
      messages: {
        search_1: JSON.stringify({
          response: { message: { ack: { status: "ACK" } } },
          passed: ["context.domain is ONDC:TRV11"],
          failed: ["fulfillments[0].type is missing"],
        }),
        on_search_1: JSON.stringify({
          response: { message: { ack: { status: "NACK" } }, error: { code: "30000", message: "bad request" } },
          passed: [],
          failed: ["catalog is empty"],
        }),
        html_form_1: JSON.stringify({ passed: ["form submitted"], failed: [] }),
        dynamic_form_1: JSON.stringify({ passed: ["Dynamic form 1 processed successfully"], failed: [] }),
        select_1: "not json",
      },
    },
    TECHNICAL_CANCELLATION_FLOW: {
      valid_flow: false,
      errors: ["Error: Expected 'cancel' after 'on_confirm', but found 'status'."],
      messages: {},
    },
  },
};

const flowMap = {
  STATION_CODE_FLOW: "4d0b8a8e-6b0a-4b5e-9a37-1c2d3e4f5a6b",
};

describe("generateCustomHTMLReport (Beckn)", () => {
  it("renders the same HTML as before the FD work", () => {
    const { html, flowResults } = generateCustomHTMLReport(report, "session-beckn-1", flowMap);
    expect(html).toMatchSnapshot();
    expect(flowResults).toEqual({ STATION_CODE_FLOW: "PASS", TECHNICAL_CANCELLATION_FLOW: "FAIL" });
  });
});
