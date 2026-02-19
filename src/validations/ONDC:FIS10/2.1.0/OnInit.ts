import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdMatch,
  validateGcAllCrossAction, validateGcAllFinancials,
  validateGcBffPercentageConsistency,
  validateGcFulfillmentIdsOnItems,
} from "../../shared/giftCardL2Validations";

export default async function on_init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10OnInit(element, sessionID, flowId, actionId, usecaseId);

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
      const initData = await getActionData(sessionID, flowId, txnId, "init");
      // GC-CTX-003,009
      validateGcAllContext(ctx, initData, result, flowId, "on_init", "init");
      validateGcMessageIdMatch(ctx, initData, result, flowId, "on_init", "init");
      // GC-PROV, GC-ITEM-004,012, GC-FUL-004, GC-BIL, GC-PAY, GC-OFR
      validateGcAllCrossAction(message, initData, result, flowId, "on_init", "init");
      // GC-PAY-001: BFF percentage
      validateGcBffPercentageConsistency(message, initData, result, flowId, "on_init", "init");
    }
    // GC-QOT-001,002,009,010, GC-PAY-004
    validateGcAllFinancials(message, result, flowId, "on_init");
    // GC-ITEM-019
    validateGcFulfillmentIdsOnItems(message, result, flowId, "on_init");
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}