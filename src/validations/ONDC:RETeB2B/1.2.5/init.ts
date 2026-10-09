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
  validateBillingDetails,
  validateIdsAgainstOnSelect,
  validateQuotePriceNoDrift,
} from "./orderFormationChecks";

export default async function init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.retEB2BInit(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;
    const mode = resolvePaymentMode(flowId);

    validateBillingDetails(order, "init", result);

    validatePaymentsPresence(order, "init", result);
    validatePaymentEnums(order, "init", result);
    // No mode lock at init: every flow's init example — Prepaid included — sends the
    // mode-agnostic stub ON-FULFILLMENT / BPP, because the buyer app has not chosen a
    // payment instrument yet. validatePaymentModeLock skips `init` for both modes.
    validatePaymentModeLock(order, "init", mode, flowId, result);
    validateCodPaymentConstraints(order, "init", mode, result);
    validatePaidTransactionId(order, "init", result);
    // No-ops on every reference init — settlement_details is the seller's to declare, and
    // no init carries it. Kept so a buyer app that does send one is still held to the enums.
    validateSettlementDetails(order, "init", result);

    // init DOES carry a quote (price + breakup) in all nine reference flows, so the
    // quote checks apply from here, not only from on_init.
    validateItemPricing(order?.items, result, "init");
    if (order?.quote) {
      validateQuoteBreakup(order.quote, result, "init");
    }

    const context = element?.jsonRequest?.context;
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
      validateIdsAgainstOnSelect(order, onSelectData, "init", result);
      validateQuotePriceNoDrift(order, onSelectData?.quote_price, "on_select", "init", result);
    }
  } catch (_) {}

  // Persisted via the `init` save-spec so on_init can be held to the billing identity,
  // provider and quote this request declared, and to the ttl it allowed for a reply.
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
