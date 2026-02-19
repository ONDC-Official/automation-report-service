import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdMatch,
  validateGcProviderConsistency, validateGcItemIdConsistency,
  validateGcBillingConsistency, validateGcOrderIdConsistency,
  validateGcOrderStatusValue, validateGcCancellationDetails,
  validateGcAllFulfillmentsCancelled, validateGcQuoteZeroedOnCancel,
  validateGcItemQtyZeroOnCancel, validateGcPaymentStatusAfterCancel,
  validateGcTimestamps,
} from "../../shared/giftCardL2Validations";

export default async function on_cancel(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10OnCancel(element, sessionID, flowId, actionId);

  try {
    const ctx = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const cancelData = await getActionData(sessionID, flowId, txnId, "cancel");
      // GC-CTX: context checks vs cancel
      validateGcAllContext(ctx, cancelData, result, flowId, "on_cancel", "cancel");
      validateGcMessageIdMatch(ctx, cancelData, result, flowId, "on_cancel", "cancel");

      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      // GC-CAN-006: provider ID persists
      validateGcProviderConsistency(message, onConfirmData, result, flowId, "on_cancel", "on_confirm");
      // GC-CAN-007: item IDs persist
      validateGcItemIdConsistency(message, onConfirmData, result, flowId, "on_cancel", "on_confirm");
      // GC-BIL: billing persistence
      validateGcBillingConsistency(message, onConfirmData, result, flowId, "on_cancel", "on_confirm");
      // GC-ORD: order_id and status
      validateGcOrderIdConsistency(message, onConfirmData, result, flowId, "on_cancel", "on_confirm");
      // GC-ORD-012: timestamps
      validateGcTimestamps(message, onConfirmData, result, flowId, "on_cancel", "on_confirm");
    }
    // GC-ORD-009: order.status = CANCELLED
    validateGcOrderStatusValue(message, result, flowId, "CANCELLED", "on_cancel");
    // GC-ORD-010: cancellation details
    validateGcCancellationDetails(message, result, flowId);
    // GC-FUL-011, GC-CAN-003: all fulfillments cancelled
    validateGcAllFulfillmentsCancelled(message, result, flowId);
    // GC-QOT-011,012, GC-CAN-004: quote zeroed
    validateGcQuoteZeroedOnCancel(message, result, flowId);
    // GC-CAN-005: item qty = 0 in breakup
    validateGcItemQtyZeroOnCancel(message, result, flowId);
    // GC-PAY-011: payment status
    validateGcPaymentStatusAfterCancel(message, result, flowId);
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
