import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";

export default async function status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) testResults.response = jsonResponse.response;

  const message = jsonRequest?.message;
  const orderId = message?.order_id || message?.ref_id;

  if (orderId) {
    testResults.passed.push("status: order_id/ref_id is present");
  } else {
    testResults.failed.push("status: order_id/ref_id is missing");
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push("Validated status");
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
