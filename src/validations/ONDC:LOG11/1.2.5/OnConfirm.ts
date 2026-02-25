import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { fetchData, saveData } from "../../../utils/redisUtils";
import { DomainValidators } from "../../shared/domainValidator";
import {
  validateOrderTimestamps,
  validateAndSaveFulfillmentIds,
  validateGpsConsistency,
  validateFulfillmentStructure,
  validateOrderIdConsistency,
  validateProviderIdConsistency,
  validateItemIdsConsistency,
  validateQuoteConsistency,
} from "../../shared/logisticsValidations";

export async function checkOnConfirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  const commonTestResults = await DomainValidators.ondclogOnConfirm(element, sessionID, flowId, action_id);
  const testResults: TestResult = {
    response: commonTestResults.response,
    passed: [...commonTestResults.passed],
    failed: [...commonTestResults.failed],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  const { context, message } = jsonRequest;
  const action = element?.action.toLowerCase();
  const transactionId = context?.transaction_id;
  const fulfillments: any[] = message?.order?.fulfillments || [];
  const createdAt = message?.order?.created_at;
  const updatedAt = message?.order?.updated_at;
  const onConfirmQuote = message?.order?.quote;
  const onConfirmOrderId = message?.order?.id;

  const isP2H2P = context.domain === "ONDC:LOG11";
  logger.info(`Inside ${action} validations for ${context.domain}`);

  // 1. Order timestamps
  validateOrderTimestamps(action, context?.timestamp, createdAt, updatedAt, testResults);

  // 2. updated_at must differ from confirm's created_at
  try {
    const confirmCreatedAt = await fetchData(sessionID, transactionId, "confirm_created_at");
    if (confirmCreatedAt) {
      assert.ok(updatedAt !== confirmCreatedAt, "order.updated_at should be updated w.r.t /confirm created_at");
      testResults.passed.push("order.updated_at is updated correctly from confirm");
    }
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  // 3. Cross-call ID comparisons
  await validateOrderIdConsistency(action, onConfirmOrderId, sessionID, transactionId, "confirm_order_id", testResults);
  await validateQuoteConsistency(action, onConfirmQuote, sessionID, transactionId, "confirm_quote", testResults);
  await validateProviderIdConsistency(action, message?.order?.provider?.id, sessionID, transactionId, "on_search_provider_id", testResults);
  await validateItemIdsConsistency(action, message?.order?.items || [], sessionID, transactionId, "init_items", testResults);

  // 4. Fulfillment IDs: confirm → on_confirm; save for downstream
  const deliveryFf = fulfillments.find((f) => f.type === "Delivery" || f.type === "FTL" || f.type === "PTL");
  await validateAndSaveFulfillmentIds(
    action, fulfillments, sessionID, transactionId,
    "confirm_delivery_fulfillment_id", "confirm_rto_fulfillment_id",
    "on_confirm_delivery_fulfillment_id", "on_confirm_rto_fulfillment_id",
    testResults
  );

  // 5. GPS consistency: search → on_confirm
  await validateGpsConsistency(action, deliveryFf, sessionID, transactionId, testResults);

  // 6. Save on_confirm data for downstream
  if (onConfirmOrderId) saveData(sessionID, transactionId, "order_id", onConfirmOrderId);
  if (message?.order?.state) saveData(sessionID, transactionId, "on_confirm_order_state", message.order.state);
  if (onConfirmQuote) saveData(sessionID, transactionId, "on_confirm_quote", onConfirmQuote);

  // 7. Per-fulfillment structure validations
  for (const ff of fulfillments) {
    if (ff.type === "Delivery" || ff.type === "FTL" || ff.type === "PTL") {
      validateFulfillmentStructure(action, ff, testResults, {
        requireTracking: true,
        requireStateCode: true,
        requireGps: true,
        requireContacts: true,
        requireStartInstructions: isP2H2P, // LOG11 P2H2P only
        requireTimeRange: true,
        requireLinkedProvider: isP2H2P,    // LOG11 P2H2P only
        requireLinkedOrder: isP2H2P,       // LOG11 P2H2P only
        requireNoPrePickupTimestamps: true,
      });
    }
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}