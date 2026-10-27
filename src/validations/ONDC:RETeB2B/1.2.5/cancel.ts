import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { compareOrderIdContinuity } from "./commonChecks";

export default async function cancel(
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

  if (message?.cancellation_reason_id) {
    testResults.passed.push(`cancel: cancellation_reason_id '${message.cancellation_reason_id}' is present`);
  } else {
    testResults.failed.push("cancel: cancellation_reason_id is missing");
  }

  const orderId = message?.order_id || message?.order?.id;
  if (!orderId) {
    testResults.failed.push("cancel: order_id is missing");
  }

  try {
    const txnId = jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      compareOrderIdContinuity(orderId, confirmData?.order_id, "cancel", testResults);
    }
  } catch (_) {}

  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push("Validated cancel");
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
