import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdUniqueness,
  validateGcAllCrossAction, validateGcFulfillmentIdsOnItems,
} from "../../shared/giftCardL2Validations";

export default async function init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10Init(element, sessionID, flowId, actionId, usecaseId);

  try {
    const ctx = element?.jsonRequest?.context;
    const msg = element?.jsonRequest?.message;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
      // GC-CTX-012,018
      validateGcAllContext(ctx, onSelectData, result, flowId, "init", "on_select");
      validateGcMessageIdUniqueness(ctx, onSelectData, result, flowId, "init", "on_select");
      // GC-PROV-003, GC-ITEM-003,009,019, GC-FUL-003, GC-BIL, GC-PAY, GC-OFR
      validateGcAllCrossAction(msg, onSelectData, result, flowId, "init", "on_select");
    }
    // GC-ITEM-019: fulfillment_ids on items
    validateGcFulfillmentIdsOnItems(msg, result, flowId, "init");
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}