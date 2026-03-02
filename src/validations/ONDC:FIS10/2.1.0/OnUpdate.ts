import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdMatch,
  validateGcOrderIdConsistency, validateGcQuoteUnchangedAfterUpdate,
  validateGcAllCrossAction, validateGcOrderStatusValue,
  validateGcTimestamps, validateGcTransactionId,
} from "../../shared/giftCardL2Validations";

export default async function on_update(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10OnUpdate(element, sessionID, flowId, actionId);

  try {
    const ctx = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const updateData = await getActionData(sessionID, flowId, txnId, "update");
      // GC-UPD-006: transaction_id match
      validateGcTransactionId(ctx, updateData, result, flowId, "on_update", "update");
      // GC-CTX
      validateGcAllContext(ctx, updateData, result, flowId, "on_update", "update");
      validateGcMessageIdMatch(ctx, updateData, result, flowId, "on_update", "update");

      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      // GC-ORD: order_id consistency
      validateGcOrderIdConsistency(message, onConfirmData, result, flowId, "on_update", "on_confirm");
      // GC-UPD-005: quote unchanged after receiver update
      validateGcQuoteUnchangedAfterUpdate(message, onConfirmData, result, flowId);
      // GC-ITEM, GC-PROV, GC-BIL, GC-PAY, GC-FUL persistence
      validateGcAllCrossAction(message, onConfirmData, result, flowId, "on_update", "on_confirm");
      // GC-ORD-012: timestamps
      validateGcTimestamps(message, onConfirmData, result, flowId, "on_update", "on_confirm");
    }
    // GC-ORD-011: order status = IN_PROGRESS
    validateGcOrderStatusValue(message, result, flowId, "IN_PROGRESS", "on_update");
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
