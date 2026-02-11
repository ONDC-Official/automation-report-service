import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { validateErrorResponse } from "../../shared/validationFactory";
import {
  validateQuoteBreakup,
  validateTermsTags,
  validateTicketFulfillment,
  validateOrderStatus,
} from "./commonChecks";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  // Handle delayed confirm (error response)
  if (actionId === "on_confirm_delayed_METRO_210") {
    const result: TestResult = { response: {}, passed: [], failed: [] };
    const { jsonRequest, jsonResponse } = element;
    if (jsonResponse?.response) result.response = jsonResponse?.response;

    // Delayed confirm may be a valid on_confirm or an error
    const message = jsonRequest?.message;
    if (message?.order) {
      // Normal on_confirm processing for delayed
      return processOnConfirm(element, result, sessionID, flowId, actionId);
    }

    // If no order, check for error
    validateErrorResponse(jsonRequest, result, actionId);
    return result;
  }

  const result = await DomainValidators.trv11OnConfirm210(element, sessionID, flowId, actionId);
  return processOnConfirm(element, result, sessionID, flowId, actionId);
}

async function processOnConfirm(
  element: Payload,
  result: TestResult,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // Validate order status
    if (order?.status) {
      validateOrderStatus(order, result, ["ACTIVE", "COMPLETE"], "on_confirm");
    }

    // Quote validation
    if (order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
      validateQuoteBreakup(order.quote, result, "on_confirm");
    }

    // 2.1.0: TICKET fulfillments with QR authorization
    if (order?.fulfillments) {
      validateTicketFulfillment(order.fulfillments, result, "on_confirm");
    }

    // 2.1.0: BAP_TERMS / BPP_TERMS in order.tags
    if (order?.tags) {
      validateTermsTags(order.tags, result, "on_confirm");
    }

    // Compare with CONFIRM
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      const onConfirmItems: any[] = order?.items || [];
      const confirmItems: any[] = confirmData?.items || [];
      const confirmPriceById = new Map<string, string>();
      for (const it of confirmItems) if (it?.id && it?.price?.value !== undefined) confirmPriceById.set(it.id, String(it.price.value));

      const priceMismatches: Array<{ id: string; confirm: string; on_confirm: string }> = [];
      for (const it of onConfirmItems) {
        const id = it?.id;
        if (!id || !confirmPriceById.has(id)) continue;
        const cnf = parseFloat(confirmPriceById.get(id) as string);
        const onCnf = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(cnf) && !Number.isNaN(onCnf)) {
          if (cnf === onCnf) result.passed.push(`Item '${id}' price matches CONFIRM`);
          else priceMismatches.push({ id, confirm: String(cnf), on_confirm: String(onCnf) });
        }
      }
      if (priceMismatches.length) {
        result.failed.push("Item price mismatches between CONFIRM and on_confirm");
        (result.response as any) = {
          ...(result.response || {}),
          on_confirm_vs_confirm: { priceMismatches },
        };
      }
    }
  } catch (_) {}

  return result;
}
