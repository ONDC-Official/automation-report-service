import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { saveData } from "../../../utils/redisUtils";
import { DomainValidators } from "../../shared/domainValidator";
import {
  validateOrderTimestamps,
  validateAndSaveFulfillmentIds,
  validateGpsConsistency,
  validateFulfillmentStructure,
  validateOrderIdConsistency,
  validateProviderIdConsistency,
  validateItemIdsConsistency,
} from "../../shared/logisticsValidations";

export async function checkConfirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  const commonTestResults = await DomainValidators.ondclogConfirm(element, sessionID, flowId, action_id);
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

  logger.info(`Inside ${action} validations for LOG11`);

  // 1. Order timestamps
  validateOrderTimestamps(action, context?.timestamp, createdAt, updatedAt, testResults);

  // 2. Cross-call ID comparisons
  await validateProviderIdConsistency(action, message?.order?.provider?.id, sessionID, transactionId, "on_search_provider_id", testResults);
  await validateItemIdsConsistency(action, message?.order?.items || [], sessionID, transactionId, "init_items", testResults);

  // 3. Fulfillment IDs: on_search → confirm; save for on_confirm
  const deliveryFf = fulfillments.find((f) => f.type === "Delivery" || f.type === "FTL" || f.type === "PTL");
  await validateAndSaveFulfillmentIds(
    action, fulfillments, sessionID, transactionId,
    "on_search_delivery_fulfillment_id", "on_search_rto_fulfillment_id",
    "confirm_delivery_fulfillment_id", "confirm_rto_fulfillment_id",
    testResults
  );

  // 4. GPS consistency: search → confirm
  await validateGpsConsistency(action, deliveryFf, sessionID, transactionId, testResults);

  // 5. Save confirm data for on_confirm
  const orderId = message?.order?.id;
  if (orderId) saveData(sessionID, transactionId, "confirm_order_id", orderId);
  if (createdAt) saveData(sessionID, transactionId, "confirm_created_at", createdAt);
  if (message?.order?.quote) saveData(sessionID, transactionId, "confirm_quote", message.order.quote);

  // 6. Save ready_to_ship per fulfillment for on_confirm/on_update
  for (const ff of fulfillments) {
    if (ff.type === "Delivery" || ff.type === "FTL" || ff.type === "PTL") {
      const stateTag = ff?.tags?.find((t: any) => t.code === "state");
      const rts = stateTag?.list?.find((e: any) => e.code === "ready_to_ship")?.value;
      if (rts !== undefined) saveData(sessionID, transactionId, `${ff.id}:rts`, rts);
    }
  }

  // 7. Per-fulfillment structure validations
  for (const ff of fulfillments) {
    if (ff.type === "Delivery" || ff.type === "FTL" || ff.type === "PTL") {
      validateFulfillmentStructure(action, ff, testResults, {
        requireTracking: true,
        requireGps: true,
        requireContacts: true,
        requireStartInstructions: true,
        requireLinkedProvider: true,
        requireLinkedOrder: true,
        requireNoPrePickupTimestamps: true,
      });
    }
  }

  // 8. COD: cod_settlement_detail tag
  if (flowId === "CASH_ON_DELIVERY_FLOW") {
    const allHaveTag = fulfillments.every((f: any) =>
      f.tags?.some((t: any) => t.code === "cod_settlement_detail")
    );
    if (!allHaveTag) {
      testResults.failed.push(`fulfillments must have a "cod_settlement_detail" tag`);
    } else {
      testResults.passed.push(`"cod_settlement_detail" tag validation passed`);
    }
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}
