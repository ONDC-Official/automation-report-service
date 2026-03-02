import { TestResult, Payload } from "../../../types/payload";

export default async function search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) result.response = jsonResponse.response;

  try {
    const context = jsonRequest?.context;
    const message = jsonRequest?.message;

    // Validate domain
    if (context?.domain === "ONDC:TRV13") {
      result.passed.push("Domain is ONDC:TRV13");
    } else {
      result.failed.push(`Invalid domain: expected ONDC:TRV13, got ${context?.domain}`);
    }

    // Validate action
    if (context?.action === "search") {
      result.passed.push("Action is search");
    } else {
      result.failed.push(`Invalid action: expected search, got ${context?.action}`);
    }

    // Validate version
    if (context?.version === "2.0.1") {
      result.passed.push("Version is 2.0.1");
    }

    // Validate category code for hotel
    const categoryCode = message?.intent?.category?.descriptor?.code;
    if (categoryCode === "HOTEL") {
      result.passed.push("Category code is HOTEL");
    } else if (categoryCode) {
      result.failed.push(`Invalid category code: expected HOTEL, got ${categoryCode}`);
    }

    // Validate BAP_TERMS if present
    const tags = message?.intent?.tags || [];
    const bapTerms = tags.find((t: any) => t?.descriptor?.code === "BAP_TERMS");
    if (bapTerms) {
      result.passed.push("BAP_TERMS tag present");
    }

    // Validate BUYER_FINDER_FEES if present
    const buyerFees = tags.find((t: any) => t?.descriptor?.code === "BUYER_FINDER_FEES");
    if (buyerFees) {
      result.passed.push("BUYER_FINDER_FEES tag present");
    }

    // Validate fulfillment stops if present
    const stops = message?.intent?.fulfillment?.stops;
    if (stops && Array.isArray(stops)) {
      const startStop = stops.find((s: any) => s?.type === "START");
      const endStop = stops.find((s: any) => s?.type === "END");
      if (startStop) result.passed.push("START stop present");
      if (endStop) result.passed.push("END stop present");
    }
  } catch (error) {
    result.failed.push(`Validation error: ${error}`);
  }

  return result;
}
