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

  // --- Fulfillment-level validations ---
  try {
    for (const fulfillment of fulfillments) {
      if (fulfillment.type === "Delivery") {
        const stateTag = fulfillment?.tags?.find((tag: any) => tag.code === "state");
        const rts = stateTag?.list?.find((entry: any) => entry.code === "ready_to_ship")?.value;

        // Save ready_to_ship for on_update validation
        if (rts !== undefined) {
          saveData(sessionID, transactionId, `${fulfillment.id}:rts`, rts);
        }

        // If rts = yes, pickup instructions must be provided
        try {
          assert.ok(
            rts === "yes" ? fulfillment?.start?.instructions : true,
            "Pickup instructions (fulfillments/start/instructions) should be provided if ready_to_ship = yes"
          );
          testResults.passed.push("Pickup instructions validation passed");
        } catch (error: any) {
          logger.error(`Error during ${action} validation: ${error.message}`);
          testResults.failed.push(error.message);
        }

        // If rts = yes, pickup time range should be present (LOG11 P2H2P)
        try {
          assert.ok(
            rts === "yes" ? fulfillment?.start?.time?.range : true,
            "Pickup time range (fulfillments/start/time/range) should be provided if ready_to_ship = yes"
          );
          testResults.passed.push("Pickup time range validation passed");
        } catch (error: any) {
          logger.error(`Error during ${action} validation: ${error.message}`);
          testResults.failed.push(error.message);
        }
      }
    }
  } catch (error: any) {
    logger.error(`Unexpected error during ${action} validation: ${error.message}`);
    testResults.failed.push(`Unexpected error: ${error.message}`);
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}
