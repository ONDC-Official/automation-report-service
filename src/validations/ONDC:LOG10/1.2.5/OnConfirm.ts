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

  logger.info(`Inside ${action} validations for LOG11`);

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
      const tags: any[] = ff?.tags ?? [];

      // Read ready_to_ship from the state tag sent back by LSP
      const stateTag = tags.find((t: any) => t.code === "state");
      const rts: string | undefined = stateTag?.list?.find((e: any) => e.code === "ready_to_ship")?.value;

      // ── a. Core structure checks ─────────────────────────────────────────
      validateFulfillmentStructure(action, ff, testResults, {
        requireTracking: true,
        requireStateCode: true,
        requireGps: true,
        requireContacts: true,
        // start.instructions (shipment label) is only needed when ready_to_ship = "yes"
        requireStartInstructions: rts === "yes",
        requireTimeRange: true,
        requireNoPrePickupTimestamps: true,
      });

      // ── b. linked_order tag: presence + required fields ──────────────────
      const linkedOrderTag = tags.find((t: any) => t.code === "linked_order");
      try {
        assert.ok(linkedOrderTag, `fulfillments/tags must contain 'linked_order' tag in ${action}`);
        testResults.passed.push(`linked_order tag present in ${action}`);
      } catch (error: any) {
        testResults.failed.push(error.message);
      }
      if (linkedOrderTag) {
        const list: { code: string; value: string }[] = linkedOrderTag.list ?? [];
        for (const field of ["id", "currency", "declared_value", "weight_unit", "weight_value"]) {
          try {
            assert.ok(list.some((l) => l.code === field), `linked_order tag must have '${field}' in ${action}`);
            testResults.passed.push(`linked_order.${field} validation passed in ${action}`);
          } catch (error: any) {
            logger.error(`Error during ${action} validation: ${error.message}`);
            testResults.failed.push(error.message);
          }
        }
      }

      // ── c. linked_order_item tags ────────────────────────────────────────
      const linkedOrderItems = tags.filter((t: any) => t.code === "linked_order_item");
      try {
        assert.ok(linkedOrderItems.length > 0, `At least one 'linked_order_item' tag must be present in ${action}`);
        testResults.passed.push(`linked_order_item presence validation passed in ${action}`);
      } catch (error: any) {
        testResults.failed.push(error.message);
      }
      for (const item of linkedOrderItems) {
        const list: { code: string; value: string }[] = item.list ?? [];
        const itemName = list.find((l) => l.code === "name")?.value ?? "(unknown)";
        for (const field of ["category", "name", "currency", "value", "quantity"]) {
          try {
            assert.ok(list.some((l) => l.code === field), `linked_order_item '${itemName}' must have '${field}' in ${action}`);
            testResults.passed.push(`linked_order_item '${itemName}'.${field} validation passed in ${action}`);
          } catch (error: any) {
            logger.error(`Error during ${action} validation: ${error.message}`);
            testResults.failed.push(error.message);
          }
        }
      }

      // ── d. state tag: ready_to_ship must be "yes" or "no" ───────────────
      if (stateTag) {
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
      }

      // ── e. rto_action tag (optional) ────────────────────────────────────
      const rtoActionTag = tags.find((t: any) => t.code === "rto_action");
      if (rtoActionTag) {
        const rtoVal = rtoActionTag?.list?.find((e: any) => e.code === "return_to_origin")?.value;
        try {
          assert.ok(
            rtoVal === "yes" || rtoVal === "no",
            `fulfillments/tags/rto_action/return_to_origin must be "yes" or "no", got '${rtoVal}' in ${action}`
          );
          testResults.passed.push(`rto_action.return_to_origin ('${rtoVal}') validation passed in ${action}`);
        } catch (error: any) {
          logger.error(`Error during ${action} validation: ${error.message}`);
          testResults.failed.push(error.message);
        }
      }

      // ── f. linked_provider tag: presence + required fields ───────────────
      const linkedProviderTag = tags.find((t: any) => t.code === "linked_provider");
      try {
        assert.ok(linkedProviderTag, `fulfillments/tags must contain 'linked_provider' tag in ${action}`);
        testResults.passed.push(`linked_provider tag present in ${action}`);
      } catch (error: any) {
        testResults.failed.push(error.message);
      }
      if (linkedProviderTag) {
        const list: { code: string; value: string }[] = linkedProviderTag.list ?? [];
        for (const field of ["id", "name"]) {
          try {
            assert.ok(list.some((l) => l.code === field), `linked_provider tag must have '${field}' in ${action}`);
            testResults.passed.push(`linked_provider.${field} validation passed in ${action}`);
          } catch (error: any) {
            logger.error(`Error during ${action} validation: ${error.message}`);
            testResults.failed.push(error.message);
          }
        }
      }
    }
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}