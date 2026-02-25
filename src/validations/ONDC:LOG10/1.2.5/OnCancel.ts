import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { fetchData, saveData } from "../../../utils/redisUtils";
import {
  validatePaymentStatus,
  validateAndSaveFulfillmentIds,
  validateGpsConsistency,
  validateFulfillmentStructure,
  validateFulfillmentTimestamps,
  validateTrackingTag,
  validateOrderIdConsistency,
  validateQuoteConsistency,
} from "../../shared/logisticsValidations";

export async function checkOnCancel(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  const testResults: TestResult = { response: {}, passed: [], failed: [] };
  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  const { context, message } = jsonRequest;
  const action = element?.action.toLowerCase();
  const transactionId = context?.transaction_id;
  const contextTimestamp = context?.timestamp;
  const fulfillments: any[] = message?.order?.fulfillments || [];
  const orderState: string = message?.order?.state ?? "";
  const orderQuote = message?.order?.quote;

  const isP2H2P = context.domain === "ONDC:LOG11";
  logger.info(`Inside ${action} validations for ${context.domain}`);

  // 1. order_id: on_confirm → on_cancel
  await validateOrderIdConsistency(action, message?.order?.id, sessionID, transactionId, "order_id", testResults);

  // 2. Quote price: on_confirm → on_cancel
  await validateQuoteConsistency(action, orderQuote, sessionID, transactionId, "on_confirm_quote", testResults);

  // 3. Fulfillment IDs: on_confirm → on_cancel
  const deliveryFf = fulfillments.find((f) => f.type === "Delivery" || f.type === "FTL" || f.type === "PTL");
  await validateAndSaveFulfillmentIds(
    action, fulfillments, sessionID, transactionId,
    "on_confirm_delivery_fulfillment_id", "on_confirm_rto_fulfillment_id",
    "", "",
    testResults
  );

  // 4. GPS consistency: search → on_cancel
  await validateGpsConsistency(action, deliveryFf, sessionID, transactionId, testResults);

  // 5. Cancellation object must be present
  try {
    assert.ok(message?.order?.cancellation, "message.order.cancellation is required in on_cancel");
    testResults.passed.push("Cancellation object presence validation passed");
  } catch (error: any) {
    testResults.failed.push(error.message);
  }

  // 6. precancel_state tag must be present in fulfillments
  try {
    const hasPreCancelState = fulfillments.some((f: any) =>
      f.tags?.some((t: any) => t.code === "precancel_state")
    );
    assert.ok(hasPreCancelState, "fulfillments/tags must contain 'precancel_state' tag in on_cancel");
    testResults.passed.push("precancel_state tag validation passed in on_cancel");
  } catch (error: any) {
    testResults.failed.push(error.message);
  }

  // 7. Order state must be Cancelled
  try {
    if (flowId === "RTO_FLOW") {
      assert.ok(orderState === "Completed", `Order state should be 'Completed', got '${orderState}'`);
    } else {
      assert.ok(orderState === "Cancelled", `Order state should be 'Cancelled', got '${orderState}'`);
    }
    testResults.passed.push(`Order state is ${orderState} validation passed`);
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  // 8. Payment validations
  validatePaymentStatus(
    action, orderState,
    message?.order?.payment?.type,
    message?.order?.payment?.status,
    message?.order?.payment?.time?.timestamp,
    testResults
  );

  // 9. Per-fulfillment validations
  for (const ff of fulfillments) {
    if (ff.type === "Delivery" || ff.type === "FTL" || ff.type === "PTL") {
      validateFulfillmentStructure(action, ff, testResults, {
        requireAwb: isP2H2P,               // LOG11 P2H2P only
        requireTracking: true,
        requireGps: true,
        requireContacts: true,
        requireLinkedProvider: isP2H2P,    // LOG11 P2H2P only
        requireLinkedOrder: isP2H2P,       // LOG11 P2H2P only
        requireShippingLabel: isP2H2P,     // LOG11 P2H2P only
        requireNoPrePickupTimestamps: true,
      });

      await validateFulfillmentTimestamps(action, ff, contextTimestamp, sessionID, transactionId, testResults);
      validateTrackingTag(action, ff, testResults);
    }
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}
