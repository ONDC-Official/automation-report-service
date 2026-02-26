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
  validateInProgressOrderState,
  validateRescheduledDelayTags,
  validateOrderIdConsistency,
  validateQuoteConsistency,
} from "../../shared/logisticsValidations";

export async function checkOnStatus(
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

  logger.info(`Inside ${action} validations for LOG11`);

  // 1. Cross-call: order_id (on_confirm → on_status)
  await validateOrderIdConsistency(action, message?.order?.id, sessionID, transactionId, "order_id", testResults);

  // 2. Cross-call: quote price (on_confirm → on_status, unless WEIGHT_DIFFERENTIAL_FLOW)
  if (flowId !== "WEIGHT_DIFFERENTIAL_FLOW" && action_id !== "on_status_4_LOGISTICS") {
    await validateQuoteConsistency(action, orderQuote, sessionID, transactionId, "on_confirm_quote", testResults);
  }

  // 3. Fulfillment IDs: on_confirm → on_status (read only)
  const deliveryFf = fulfillments.find((f) => f.type === "Delivery" || f.type === "FTL" || f.type === "PTL");
  await validateAndSaveFulfillmentIds(
    action, fulfillments, sessionID, transactionId,
    "on_confirm_delivery_fulfillment_id", "on_confirm_rto_fulfillment_id",
    "", "",   // no re-save needed (on_confirm IDs are still correct)
    testResults
  );

  // 4. GPS consistency: search → on_status
  await validateGpsConsistency(action, deliveryFf, sessionID, transactionId, testResults);

  // 5. Payment validations
  validatePaymentStatus(
    action, orderState,
    message?.order?.payment?.type,
    message?.order?.payment?.status,
    message?.order?.payment?.time?.timestamp,
    testResults
  );

  // 6. Per-fulfillment validations
  for (const ff of fulfillments) {
    if (ff.type === "Delivery" || ff.type === "FTL" || ff.type === "PTL") {
      const ffState: string = ff?.state?.descriptor?.code ?? "";
      const tags: any[] = ff?.tags ?? [];

      // Structure checks
      validateFulfillmentStructure(action, ff, testResults, {
        requireAwb: true,          // LOG11 P2H2P
        requireTracking: true,
        requireGps: true,
        requireContacts: true,
        requireLinkedProvider: true,
        requireLinkedOrder: true,
        requireShippingLabel: true, // LOG11 P2H2P
        requireTimeRange: true,
        requireNoPrePickupTimestamps: true,
      });

      // State-based checks
      validateInProgressOrderState(action, ffState, orderState, testResults);

      // Agent required for in-transit states
      if (["Agent-assigned", "Order-picked-up", "Out-for-delivery", "At-destination-hub", "In-transit"].includes(ffState)) {
        try {
          assert.ok(
            ff?.agent?.name || ff?.agent?.phone,
            "fulfillments/agent must be present when agent is assigned"
          );
          testResults.passed.push("Agent details validation passed in on_status");
        } catch (error: any) {
          logger.error(`Error during ${action} validation: ${error.message}`);
          testResults.failed.push(error.message);
        }
      }

      // Pickup instructions images at pickup
      if (ffState === "Order-picked-up") {
        try {
          const images = ff?.start?.instructions?.images;
          assert.ok(images && images.length > 0, "fulfillments/start/instructions/images (shipping label) required at pickup");
          testResults.passed.push("Pickup instructions images validation passed");
        } catch (error: any) {
          logger.error(`Error during ${action} validation: ${error.message}`);
          testResults.failed.push(error.message);
        }
      }

      // Pickup / delivery timestamps
      await validateFulfillmentTimestamps(action, ff, contextTimestamp, sessionID, transactionId, testResults);

      // Tracking tag (post-pickup)
      validateTrackingTag(action, ff, testResults);

      // Rescheduled delay tags
      validateRescheduledDelayTags(action, ff, testResults);

      // COD: cod_collection_detail on delivery
      if (ffState === "Order-delivered" && flowId === "CASH_ON_DELIVERY_FLOW") {
        try {
          assert.ok(
            tags.some((t: any) => t.code === "cod_collection_detail"),
            `fulfillments must have "cod_collection_detail" tag when order is delivered in COD flow`
          );
          testResults.passed.push(`"cod_collection_detail" tag validation passed`);
        } catch (error: any) {
          testResults.failed.push(error.message);
        }
      }
    }
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}
