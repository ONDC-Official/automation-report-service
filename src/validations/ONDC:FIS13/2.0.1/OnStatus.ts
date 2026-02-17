import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateInsuranceContext,
  validateInsuranceOrderStatus,
  validateInsuranceDocuments,
} from "../../shared/healthInsuranceValidations";
import {
  validateQuoteBreakupSum,
  validateCreatedUpdatedAt,
  validateOrderStatusTransition,
  validateFulfillmentStateTransition,
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";

export default async function on_status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13OnStatus(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Health insurance context validation
    validateInsuranceContext(context, result, flowId);

    // Health insurance order status enum
    if (message) {
      validateInsuranceOrderStatus(message, result, flowId);
    }

    // Health insurance document types
    if (message) {
      validateInsuranceDocuments(message, result, flowId);
    }

    // ── L2: Financial ──
    if (message) {
      validateQuoteBreakupSum(message, result, flowId, "on_status");
    }

    // ── L2: Timestamps ──
    if (message) {
      validateCreatedUpdatedAt(message, result, flowId, "on_status");
    }

    // ── L2: State transitions vs on_confirm ──
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      if (onConfirmData) {
        validateOrderStatusTransition(message, onConfirmData, result, flowId, "on_status", "on_confirm");
        validateFulfillmentStateTransition(message, onConfirmData, result, flowId, "on_status", "on_confirm");
        validateAllContext(context, onConfirmData, result, flowId, "on_status", "on_confirm");
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
