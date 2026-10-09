import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateQuoteBreakup,
  validateOrderState,
  validateItemPricing,
  compareOrderIdContinuity,
} from "./commonChecks";
import {
  resolvePaymentMode,
  validatePaymentsPresence,
  validatePaymentEnums,
  validatePaymentModeLock,
  validateCodPaymentConstraints,
  validatePaidTransactionId,
  validateSettlementDetails,
  validateSettlementBasisWindow,
  validatePaymentAmountMatchesQuote,
  validateBppTerms,
  validateCreditTerms,
  validateBapTerms,
  validateOrderTimestamps,
  validateBppTermsEcho,
  validateSettlementDetailsEcho,
  validateFinderFeeEcho,
  validateQuotePriceNoDrift,
  validateBillingEcho,
  validateProviderContinuity,
  validateIdsAgainstOnSelect,
  validatePaymentStatusNoRegression,
  validateCallbackTtlWindow,
} from "./orderFormationChecks";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.retEB2BOnConfirm(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;
    const context = element?.jsonRequest?.context;
    const mode = resolvePaymentMode(flowId);

    if (order?.state) {
      validateOrderState(order, result, ["Created", "Accepted"], "on_confirm");
    }
    // created_at is NOT required here and is NOT compared against confirm's: the reference
    // payloads legitimately re-stamp it (COD ...595Z at confirm vs ...612Z at on_confirm).
    validateOrderTimestamps(order, context, "on_confirm", result);

    validatePaymentsPresence(order, "on_confirm", result);
    validatePaymentEnums(order, "on_confirm", result);
    validatePaymentModeLock(order, "on_confirm", mode, flowId, result);
    validateCodPaymentConstraints(order, "on_confirm", mode, result);
    validatePaidTransactionId(order, "on_confirm", result);

    validateSettlementDetails(order, "on_confirm", result);
    validateSettlementBasisWindow(order, "on_confirm", result);
    validatePaymentAmountMatchesQuote(order, "on_confirm", result);

    validateBppTerms(order, "on_confirm", result);
    validateCreditTerms(order, "on_confirm", result);
    validateBapTerms(order, "on_confirm", result);

    validateItemPricing(order?.items, result, "on_confirm");
    if (order?.quote) {
      validateQuoteBreakup(order.quote, result, "on_confirm");
    }

    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      compareOrderIdContinuity(order?.id, confirmData?.order_id, "on_confirm", result);
      validateBppTermsEcho(order, confirmData?.bpp_terms, "on_confirm", result);
      // The generated COD scripts omit the settlement_details echo at BOTH confirm and
      // on_confirm; it is applied at both here.
      validateSettlementDetailsEcho(order, confirmData?.settlement_details, "on_confirm", result);
      validateFinderFeeEcho(order, confirmData?.payments, "confirm", "on_confirm", result);
      validateQuotePriceNoDrift(order, confirmData?.quote_price, "confirm", "on_confirm", result);
      validateBillingEcho(order, confirmData?.billing, "on_confirm", result);
      validateProviderContinuity(order, confirmData?.provider, "confirm", "on_confirm", result);
      validatePaymentStatusNoRegression(order, confirmData?.payments, "confirm", "on_confirm", result);
      validateCallbackTtlWindow(context, confirmData?.timestamp, confirmData?.ttl, "confirm", "on_confirm", result);

      const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
      validateIdsAgainstOnSelect(order, onSelectData, "on_confirm", result);
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
