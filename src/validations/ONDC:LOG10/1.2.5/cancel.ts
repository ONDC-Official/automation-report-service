import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { fetchData } from "../../../utils/redisUtils";

export async function checkCancel(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  const payload = element;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations for LOG11`);

  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const { context, message } = jsonRequest;
  const transactionId = context?.transaction_id;

  // --- Cross-call Comparison: on_confirm → cancel ---
  try {
    // Compare order_id from on_confirm → cancel
    const savedOrderId = await fetchData(sessionID, transactionId, "order_id");
    const cancelOrderId = message?.order_id;

    if (savedOrderId && cancelOrderId) {
      try {
        assert.strictEqual(
          cancelOrderId,
          savedOrderId,
          `Order ID in cancel (${cancelOrderId}) does not match on_confirm (${savedOrderId})`
        );
        testResults.passed.push("Order ID matches between on_confirm and cancel");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    } else {
      try {
        assert.ok(cancelOrderId, "message.order_id is required in cancel request");
        testResults.passed.push("Order ID presence validation in cancel passed");
      } catch (error: any) {
        testResults.failed.push(error.message);
      }
    }

    // Validate cancellation_reason_id is provided
    const cancellationReasonId = message?.cancellation_reason_id;
    try {
      assert.ok(
        cancellationReasonId,
        "message.cancellation_reason_id is required in cancel request"
      );
      testResults.passed.push("Cancellation reason ID presence validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  } catch (error: any) {
    logger.error(`Error during ${action} cross-call comparison: ${error.message}`);
    testResults.failed.push(error.message);
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}
