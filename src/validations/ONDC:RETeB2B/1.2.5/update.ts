import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";

export default async function update(
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

  // Note: deliberately NOT using the shared createUpdateValidator() factory here — it
  // unconditionally validates update_target against a TRV10-specific whitelist
  // (e.g. "order.quote.breakup", "fulfillments[0].stops") that doesn't match ONDC
  // retail's update_target values, which would produce guaranteed false-positive failures.
  if (message?.update_target) {
    testResults.passed.push(`update: update_target '${message.update_target}' is present`);
  } else {
    testResults.failed.push("update: update_target is missing");
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push("Validated update");
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
