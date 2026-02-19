import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateGcAllContext, validateGcMessageIdMatch,
  validateGcAllCrossAction, validateGcAllFinancials,
  validateGcFulfillmentCountMatchesQuantity, validateGcFulfillmentIdsOnItems,
  validateGcQuoteConsistency,
} from "../../shared/giftCardL2Validations";

export default async function on_select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10OnSelect(element, sessionID, flowId, actionId, usecaseId);

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
      const selectData = await getActionData(sessionID, flowId, txnId, "select");
      // GC-CTX-002,008
      validateGcAllContext(ctx, selectData, result, flowId, "on_select", "select");
      validateGcMessageIdMatch(ctx, selectData, result, flowId, "on_select", "select");
      // GC-PROV-002, GC-ITEM-002,008,011,016, GC-OFR-002, GC-PAY, GC-BIL, GC-FUL
      validateGcAllCrossAction(message, selectData, result, flowId, "on_select", "select");
      // GC-QOT-001,002,009,010, GC-PAY-004
      validateGcAllFinancials(message, result, flowId, "on_select");
    }
    // GC-FUL-010, GC-ITEM-019
    validateGcFulfillmentCountMatchesQuantity(message, result, flowId, "on_select");
    validateGcFulfillmentIdsOnItems(message, result, flowId, "on_select");
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}