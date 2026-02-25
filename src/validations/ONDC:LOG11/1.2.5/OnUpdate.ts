import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { fetchData, saveData } from "../../../utils/redisUtils";
import {
  validateAndSaveFulfillmentIds,
  validateGpsConsistency,
  validateFulfillmentStructure,
  validateOrderIdConsistency,
} from "../../shared/logisticsValidations";

export async function checkOnUpdate(
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
  const fulfillments: any[] = message?.order?.fulfillments || [];
  const quote = message?.order?.quote;

  const isP2H2P = context.domain === "ONDC:LOG11";
  logger.info(`Inside ${action} validations for ${context.domain}`);

  // 1. order_id: on_confirm → on_update
  await validateOrderIdConsistency(action, message?.order?.id, sessionID, transactionId, "order_id", testResults);

  // 2. Fulfillment IDs: on_confirm → on_update
  const deliveryFf = fulfillments.find((f) => f.type === "Delivery" || f.type === "FTL" || f.type === "PTL");
  await validateAndSaveFulfillmentIds(
    action, fulfillments, sessionID, transactionId,
    "on_confirm_delivery_fulfillment_id", "on_confirm_rto_fulfillment_id",
    "", "",
    testResults
  );

  // 3. GPS consistency: search → on_update
  await validateGpsConsistency(action, deliveryFf, sessionID, transactionId, testResults);

  // 4. Per-fulfillment structure validations
  for (const ff of fulfillments) {
    if (ff.type === "Delivery" || ff.type === "FTL" || ff.type === "PTL") {
      const ffState: string = ff?.state?.descriptor?.code ?? "";
      const tags: any[] = ff?.tags ?? [];

      validateFulfillmentStructure(action, ff, testResults, {
        requireAwb: isP2H2P,               // LOG11 P2H2P only
        requireTracking: true,
        requireGps: true,
        requireContacts: true,
        requireLinkedProvider: isP2H2P,    // LOG11 P2H2P only
        requireLinkedOrder: isP2H2P,       // LOG11 P2H2P only
        requireShippingLabel: isP2H2P,     // LOG11 P2H2P only
        requireTimeRange: true,
        requireNoPrePickupTimestamps: true,
      });

      // Agent required for in-transit states
      if (["Agent-assigned", "Order-picked-up", "Out-for-delivery", "At-destination-hub", "In-transit"].includes(ffState)) {
        try {
          assert.ok(
            ff?.agent?.name || ff?.agent?.phone,
            "fulfillments/agent must be present when agent is assigned in on_update"
          );
          testResults.passed.push("Agent details validation passed in on_update");
        } catch (error: any) {
          logger.error(`Error during ${action} validation: ${error.message}`);
          testResults.failed.push(error.message);
        }
      }

      // ready_to_ship → pickup time range
      const rtsRaw = await fetchData(sessionID, transactionId, `${ff?.id}:rts`);
      const rtsValue = typeof rtsRaw === "string" ? rtsRaw : (rtsRaw as any)?.value;
      if (rtsValue === "yes") {
        try {
          assert.ok(ff?.start?.time?.range, "fulfillments/start/time/range required if ready_to_ship=yes in /on_update");
          testResults.passed.push("Pickup time range validation passed");
        } catch (error: any) {
          logger.error(`Error during ${action} validation: ${error.message}`);
          testResults.failed.push(error.message);
        }
      }
    }
  }

  // 5. WEIGHT_DIFFERENTIAL_FLOW: diff and tax_diff in quote breakup
  if (flowId === "WEIGHT_DIFFERENTIAL_FLOW") {
    let diffTagsPresent = false;
    for (const ff of fulfillments) {
      const ffState: string = ff?.state?.descriptor?.code ?? "";
      const hasDiff = ff.tags?.some((t: any) => t.code === "linked_order_diff");
      const hasDiffProof = ff.tags?.some((t: any) => t.code === "linked_order_diff_proof");
      if (hasDiff) diffTagsPresent = true;
      if (["Out-for-pickup", "At-destination-hub"].includes(ffState)) {
        try {
          assert.ok(hasDiff && hasDiffProof, "'linked_order_diff' and 'linked_order_diff_proof' tags are missing");
          testResults.passed.push("Diff tags validation passed");
        } catch (error: any) {
          logger.error(`Error during ${action} validation: ${error.message}`);
          testResults.failed.push(error.message);
        }
      }
    }
    if (diffTagsPresent && quote) {
      try {
        const hasDiffBreakup = quote.breakup?.some((b: any) => b["@ondc/org/title_type"] === "diff");
        const hasTaxDiff = quote.breakup?.some((b: any) => b["@ondc/org/title_type"] === "tax_diff");
        assert.ok(hasDiffBreakup && hasTaxDiff, "'diff' and 'tax_diff' titles are missing in quote.breakup");
        testResults.passed.push("Diff items in quote breakup validation passed");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }
  }

  // 6. E-POD flow
  if (flowId === "E-POD") {
    const { validateEpodProofs } = await import("../../shared");
    validateEpodProofs(flowId, message, testResults);
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}
