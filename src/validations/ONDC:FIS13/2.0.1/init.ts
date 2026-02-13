import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateInsuranceContext,
  validateInsuranceBilling,
  validateInsuranceFulfillments,
  validateInsurancePaymentTags,
  validateInsuranceInitXinput,
} from "../../shared/healthInsuranceValidations";
import {
  validateProviderConsistency,
  validateItemConsistency,
  validatePaymentCollectedByConsistency,
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";

export default async function init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13Init(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Health insurance context validation
    validateInsuranceContext(context, result, flowId);

    // Health insurance billing validation (name, phone, email)
    if (message) {
      validateInsuranceBilling(message, result, flowId);
    }

    // Health insurance fulfillments validation (type, customer details)
    if (message) {
      validateInsuranceFulfillments(message, result, flowId, actionId);
    }

    // Health insurance payment tags (BUYER_FINDER_FEES, SETTLEMENT_TERMS)
    if (message) {
      validateInsurancePaymentTags(message, result, flowId, "order");
    }

    // Health insurance init xinput form_response validation
    if (message) {
      validateInsuranceInitXinput(message, result, flowId);
    }

    // ── L2: Cross-action consistency vs on_select ──
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
      if (onSelectData) {
        validateProviderConsistency(message, onSelectData, result, flowId, "init", "on_select");
        validateItemConsistency(message, onSelectData, result, flowId, "init", "on_select");
        validatePaymentCollectedByConsistency(message, onSelectData, result, flowId, "init", "on_select");
        validateAllContext(context, onSelectData, result, flowId, "init", "on_select");
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
