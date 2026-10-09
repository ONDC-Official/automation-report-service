import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateOrderState } from "./commonChecks";

export default async function on_cancel(
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

  // Note: deliberately NOT using the shared createOnCancelValidator() factory here —
  // its unconditional validateCancellation() check validates order.status against
  // mobility-style values (SOFT_CANCEL/CANCELLED), but ONDC retail uses order.state
  // (title-case "Cancelled"), so it would push a guaranteed false-positive failure.
  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) testResults.response = jsonResponse.response;

  const message = jsonRequest?.message;
  const order = message?.order;

  if (order?.state) {
    validateOrderState(order, testResults, ["Cancelled"], "on_cancel");
  }

  if (order?.cancellation) {
    testResults.passed.push("on_cancel: cancellation details present");
  }

  // TODO(RETeB2B-B2B): merchant-RTO-specific tags (RTO, part-cancellation item-level breakdown).
  // Note: the Merchant-side RTO/part-cancellation flow routes through on_update/on_status,
  // not on_cancel — see OnUpdate.ts.

  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push("Validated on_cancel");
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
