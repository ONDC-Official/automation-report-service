import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateQuoteBreakup, validateItemPricing } from "./commonChecks";
import {
  resolvePaymentMode,
  validatePaymentsPresence,
  validatePaymentEnums,
  validatePaymentModeLock,
  validateCodPaymentConstraints,
  validatePaidTransactionId,
  validateSettlementDetails,
  validateBppTerms,
  validateCreditTerms,
  validateIdsAgainstOnSelect,
  validateQuotePriceNoDrift,
  validateBillingEcho,
  validateProviderContinuity,
  validateCallbackTtlWindow,
} from "./orderFormationChecks";

export default async function on_init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.retEB2BOnInit(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;
    const mode = resolvePaymentMode(flowId);

    validatePaymentsPresence(order, "on_init", result);
    validatePaymentEnums(order, "on_init", result);
    // COD's lock applies from on_init onward — both `(cod)` flows send a clean
    // ON-FULFILLMENT / BPP here. Prepaid's does NOT: with_offers(Prepaid) ships an
    // on_init with the incoherent ON-ORDER + collected_by BPP, so validatePaymentModeLock
    // skips `on_init` for prepaid.
    validatePaymentModeLock(order, "on_init", mode, flowId, result);
    validateCodPaymentConstraints(order, "on_init", mode, result);
    validatePaidTransactionId(order, "on_init", result);

    // The seller's settlement account, declared here and frozen from here on.
    validateSettlementDetails(order, "on_init", result);
    // Deliberately NOT validateSettlementBasisWindow: @ondc/org/settlement_basis /
    // _window / _withholding_amount are absent from on_init in all nine reference flows.
    // The terms are agreed at confirm, where they are checked.

    validateBppTerms(order, "on_init", result);
    // The one genuinely B2B term in this leg, and the only action that declares it.
    validateCreditTerms(order, "on_init", result, { required: true });

    validateItemPricing(order?.items, result, "on_init");
    if (order?.quote) {
      validateQuoteBreakup(order.quote, result, "on_init");
    }

    const context = element?.jsonRequest?.context;
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const initData = await getActionData(sessionID, flowId, txnId, "init");
      validateBillingEcho(order, initData?.billing, "on_init", result);
      validateProviderContinuity(order, initData?.provider, "init", "on_init", result);
      validateQuotePriceNoDrift(order, initData?.quote_price, "init", "on_init", result);
      validateCallbackTtlWindow(context, initData?.timestamp, initData?.ttl, "init", "on_init", result);

      const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
      validateIdsAgainstOnSelect(order, onSelectData, "on_init", result);
    }
  } catch (_) {}

  // Persisted via the `on_init` save-spec so confirm/on_confirm can be held to the
  // bpp_terms, settlement_details, finder fee and quote price quoted here — the echoes
  // the generated COD scripts omit.
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
