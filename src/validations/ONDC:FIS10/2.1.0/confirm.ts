import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdUniqueness,
  validateGcAllCrossAction, validateGcQuoteConsistency,
  validateGcOrderStatusValue,
} from "../../shared/giftCardL2Validations";

export default async function confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10Confirm(element, sessionID, flowId, actionId, usecaseId);

  try {
    const ctx = element?.jsonRequest?.context;
    const msg = element?.jsonRequest?.message;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const onInitData = await getActionData(sessionID, flowId, txnId, "on_init");
      // GC-CTX-012,018
      validateGcAllContext(ctx, onInitData, result, flowId, "confirm", "on_init");
      validateGcMessageIdUniqueness(ctx, onInitData, result, flowId, "confirm", "on_init");
      // GC-ITEM-005,013, GC-FUL-006, GC-PAY-002,003,007, GC-BIL, GC-OFR
      validateGcAllCrossAction(msg, onInitData, result, flowId, "confirm", "on_init");
      // GC-QOT-004: quote consistency
      validateGcQuoteConsistency(msg, onInitData, result, flowId, "confirm", "on_init");
    }
    // GC-ORD-004: order.status = CREATED
    validateGcOrderStatusValue(msg, result, flowId, "CREATED", "confirm");
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}