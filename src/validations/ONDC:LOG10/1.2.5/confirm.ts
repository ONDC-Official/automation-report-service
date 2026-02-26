import assert from "assert";
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

/** Validates linked_order tag structure and required fields */
function validateLinkedOrderTag(
  action: string,
  tags: any[],
  testResults: TestResult
): void {
  const tag = tags.find((t: any) => t.code === "linked_order");
  try {
    assert.ok(tag, `fulfillments/tags must contain 'linked_order' tag in ${action}`);
    testResults.passed.push(`linked_order tag present in ${action}`);
  } catch (error: any) {
    testResults.failed.push(error.message);
    return; // no point validating fields if tag is missing
  }

  const list: { code: string; value: string }[] = tag.list ?? [];
  const required = ["id", "currency", "declared_value", "weight_unit", "weight_value"];
  for (const field of required) {
    try {
      assert.ok(
        list.some((l) => l.code === field),
        `linked_order tag must have '${field}' in fulfillments/tags in ${action}`
      );
      testResults.passed.push(`linked_order.${field} validation passed in ${action}`);
    } catch (error: any) {
      logger.error(`Error during ${action} validation: ${error.message}`);
      testResults.failed.push(error.message);
    }
  }
}

/** Validates at least one linked_order_item tag is present with required fields */
function validateLinkedOrderItemTags(
  action: string,
  tags: any[],
  testResults: TestResult
): void {
  const items = tags.filter((t: any) => t.code === "linked_order_item");
  try {
    assert.ok(
      items.length > 0,
      `At least one 'linked_order_item' tag must be present in fulfillments/tags in ${action}`
    );
    testResults.passed.push(`linked_order_item presence validation passed in ${action}`);
  } catch (error: any) {
    testResults.failed.push(error.message);
    return;
  }

  const required = ["category", "name", "currency", "value", "quantity"];
  for (const item of items) {
    const list: { code: string; value: string }[] = item.list ?? [];
    const itemName = list.find((l) => l.code === "name")?.value ?? "(unknown)";
    for (const field of required) {
      try {
        assert.ok(
          list.some((l) => l.code === field),
          `linked_order_item '${itemName}' must have '${field}' in ${action}`
        );
        testResults.passed.push(`linked_order_item '${itemName}'.${field} validation passed in ${action}`);
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }
  }
}

/** Validates state tag — ready_to_ship must be "yes" or "no" */
function validateStateTag(
  action: string,
  tags: any[],
  testResults: TestResult
): string | undefined {
  const stateTag = tags.find((t: any) => t.code === "state");
  try {
    assert.ok(stateTag, `fulfillments/tags must contain 'state' tag in ${action}`);
  } catch (error: any) {
    testResults.failed.push(error.message);
    return undefined;
  }

  const rts = stateTag?.list?.find((e: any) => e.code === "ready_to_ship")?.value;
  try {
    assert.ok(
      rts === "yes" || rts === "no",
      `fulfillments/tags/state/ready_to_ship must be "yes" or "no", got '${rts}' in ${action}`
    );
    testResults.passed.push(`state.ready_to_ship ('${rts}') validation passed in ${action}`);
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }
  return rts;
}

/** Validates rto_action tag — return_to_origin must be "yes" or "no" */
function validateRtoActionTag(
  action: string,
  tags: any[],
  testResults: TestResult
): void {
  const rtoActionTag = tags.find((t: any) => t.code === "rto_action");
  if (!rtoActionTag) return; // optional tag

  const val = rtoActionTag?.list?.find((e: any) => e.code === "return_to_origin")?.value;
  try {
    assert.ok(
      val === "yes" || val === "no",
      `fulfillments/tags/rto_action/return_to_origin must be "yes" or "no", got '${val}' in ${action}`
    );
    testResults.passed.push(`rto_action.return_to_origin ('${val}') validation passed in ${action}`);
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }
}

/** Validates linked_provider tag structure — id and name are required */
function validateLinkedProviderTag(
  action: string,
  tags: any[],
  testResults: TestResult
): void {
  const tag = tags.find((t: any) => t.code === "linked_provider");
  try {
    assert.ok(tag, `fulfillments/tags must contain 'linked_provider' tag in ${action}`);
    testResults.passed.push(`linked_provider tag present in ${action}`);
  } catch (error: any) {
    testResults.failed.push(error.message);
    return;
  }

  const list: { code: string; value: string }[] = tag.list ?? [];
  const required = ["id", "name"];
  for (const field of required) {
    try {
      assert.ok(
        list.some((l) => l.code === field),
        `linked_provider tag must have '${field}' in fulfillments/tags in ${action}`
      );
      testResults.passed.push(`linked_provider.${field} validation passed in ${action}`);
    } catch (error: any) {
      logger.error(`Error during ${action} validation: ${error.message}`);
      testResults.failed.push(error.message);
    }
  }
}

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

  // 6. Per-fulfillment validations
  for (const ff of fulfillments) {
    if (ff.type === "Delivery" || ff.type === "FTL" || ff.type === "PTL") {
      const tags: any[] = ff?.tags ?? [];

      // ── a. State tag: read ready_to_ship ──────────────────────────────────
      const rts = validateStateTag(action, tags, testResults);

      // Save ready_to_ship per fulfillment for on_confirm / on_update
      if (rts !== undefined) saveData(sessionID, transactionId, `${ff.id}:rts`, { value: rts });

      // ── b. Core structure checks ──────────────────────────────────────────
      validateFulfillmentStructure(action, ff, testResults, {
        requireGps: true,
        requireContacts: true,
        // start.instructions (shipment label) is only required when ready_to_ship = "yes"
        requireStartInstructions: rts === "yes",
        requireNoPrePickupTimestamps: true,
      });

      // ── c. linked_order tag structure ─────────────────────────────────────
      validateLinkedOrderTag(action, tags, testResults);

      // ── d. linked_order_item tags ─────────────────────────────────────────
      validateLinkedOrderItemTags(action, tags, testResults);

      // ── e. rto_action tag ─────────────────────────────────────────────────
      validateRtoActionTag(action, tags, testResults);

      // ── f. linked_provider tag structure ──────────────────────────────────
      validateLinkedProviderTag(action, tags, testResults);
    }
  }

  // 7. COD: cod_settlement_detail tag
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
