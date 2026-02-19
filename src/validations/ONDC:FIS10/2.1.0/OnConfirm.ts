import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateGcAllContext, validateGcMessageIdMatch,
  validateGcAllCrossAction, validateGcAllFinancials,
  validateGcOrderStatusValue, validateGcOrderIdConsistency,
  validateGcTimestamps, validateGcFulfillmentStateProgression,
  validateGcFulfillmentIdsOnItems,
} from "../../shared/giftCardL2Validations";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10OnConfirm(element, sessionID, flowId, actionId, usecaseId);

  try {
    const ctx = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
    }

    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      // GC-CTX-004,010
      validateGcAllContext(ctx, confirmData, result, flowId, "on_confirm", "confirm");
      validateGcMessageIdMatch(ctx, confirmData, result, flowId, "on_confirm", "confirm");
      // GC-ITEM-006,014, GC-FUL-007, GC-PAY-005,008, GC-BIL, GC-OFR
      validateGcAllCrossAction(message, confirmData, result, flowId, "on_confirm", "confirm");
      // GC-ORD-001: order_id consistency
      validateGcOrderIdConsistency(message, confirmData, result, flowId, "on_confirm", "confirm");
      // GC-FUL-007: fulfillment state progression
      validateGcFulfillmentStateProgression(message, confirmData, result, flowId, "on_confirm", "confirm");
      // GC-ORD-012: timestamps
      validateGcTimestamps(message, confirmData, result, flowId, "on_confirm", "confirm");
    }
    // GC-ORD-005: order.status = ACCEPTED
    validateGcOrderStatusValue(message, result, flowId, "ACCEPTED", "on_confirm");
    // GC-QOT-001,002,009,010, GC-PAY-004
    validateGcAllFinancials(message, result, flowId, "on_confirm");
    // GC-ITEM-019
    validateGcFulfillmentIdsOnItems(message, result, flowId, "on_confirm");
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}