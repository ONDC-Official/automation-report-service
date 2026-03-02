import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdUniqueness,
  validateGcUpdateTarget, validateGcUpdateOrderIdMatch,
} from "../../shared/giftCardL2Validations";

export default async function update(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10Update(element, sessionID, flowId, actionId);

  try {
    const ctx = element?.jsonRequest?.context;
    const msg = element?.jsonRequest?.message;
    // GC-UPD-001: update_target present
    validateGcUpdateTarget(msg, result, flowId);

    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      // GC-UPD-002: order_id match
      validateGcUpdateOrderIdMatch(msg, onConfirmData, result, flowId);
      // GC-CTX-012,018
      validateGcAllContext(ctx, onConfirmData, result, flowId, "update", "on_confirm");
      validateGcMessageIdUniqueness(ctx, onConfirmData, result, flowId, "update", "on_confirm");
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
