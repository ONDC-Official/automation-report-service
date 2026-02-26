import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { fetchData, saveData } from "../../../utils/redisUtils";

export async function checkUpdate(
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
  const contextTimestamp = context?.timestamp;
  const transactionId = context?.transaction_id;
  const updatedAt = message?.order?.updated_at;
  const fulfillments = message?.order?.fulfillments || [];

  // updated_at <= context/timestamp
  try {
    assert.ok(
      contextTimestamp >= updatedAt,
      "order.updated_at timestamp should be less than or equal to context/timestamp"
    );
    testResults.passed.push("order.updated_at timestamp validation passed");
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  // --- Cross-call Comparison: on_confirm → update ---
  try {
    // Compare order_id from on_confirm → update
    const savedOrderId = await fetchData(sessionID, transactionId, "order_id");
    const updateOrderId = message?.order?.id;

    if (savedOrderId && updateOrderId) {
      try {
        assert.strictEqual(
          updateOrderId,
          savedOrderId,
          `Order ID in update (${updateOrderId}) does not match on_confirm (${savedOrderId})`
        );
        testResults.passed.push("Order ID matches between on_confirm and update");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }
  } catch (error: any) {
    logger.error(`Error during ${action} cross-call comparison: ${error.message}`);
    testResults.failed.push(error.message);
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}
