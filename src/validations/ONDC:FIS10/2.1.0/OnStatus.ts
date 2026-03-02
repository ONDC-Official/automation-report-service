import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdMatch,
  validateGcAllCrossAction, validateGcAllFinancials,
  validateGcOrderIdConsistency, validateGcOrderStatusTransition,
  validateGcTimestamps, validateGcFulfillmentStateProgression,
  validateGcReceiverContactPersistence,
} from "../../shared/giftCardL2Validations";

export default async function on_status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10OnStatus(element, sessionID, flowId, actionId, usecaseId);

  try {
    const ctx = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const statusData = await getActionData(sessionID, flowId, txnId, "status");
      // GC-CTX-005,011
      validateGcAllContext(ctx, statusData, result, flowId, "on_status", "status");
      validateGcMessageIdMatch(ctx, statusData, result, flowId, "on_status", "status");

      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      // GC-ITEM-007,010,015, GC-FUL-008,009, GC-PAY-009, GC-BIL, GC-OFR
      validateGcAllCrossAction(message, onConfirmData, result, flowId, "on_status", "on_confirm");
      // GC-ORD-002: order_id consistency
      validateGcOrderIdConsistency(message, onConfirmData, result, flowId, "on_status", "on_confirm");
      // GC-ORD-006,007,008: status transitions
      validateGcOrderStatusTransition(message, onConfirmData, result, flowId, "on_status", "on_confirm");
      // GC-FUL-008: fulfillment state progression
      validateGcFulfillmentStateProgression(message, onConfirmData, result, flowId, "on_status", "on_confirm");
      // GC-FUL-009: receiver contact persistence
      validateGcReceiverContactPersistence(message, onConfirmData, result, flowId, "on_status", "on_confirm");
      // GC-ORD-012: timestamps
      validateGcTimestamps(message, onConfirmData, result, flowId, "on_status", "on_confirm");
    }
    // GC-QOT-001,002, GC-PAY-004
    validateGcAllFinancials(message, result, flowId, "on_status");
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
