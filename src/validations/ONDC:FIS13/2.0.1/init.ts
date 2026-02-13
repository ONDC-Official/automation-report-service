import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { HEALTH_INSURANCE_FLOWS } from "../../../utils/constants";
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
  const isHealthInsurance = !!flowId && HEALTH_INSURANCE_FLOWS.includes(flowId);

  // Skip DomainValidators (required + enum) for Health Insurance flows
  const result: TestResult = isHealthInsurance
    ? { response: {}, passed: [], failed: [] }
    : await DomainValidators.fis13Init(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Skip required/enum validations for Health Insurance
    if (!isHealthInsurance) {
      validateInsuranceContext(context, result, flowId);

      if (message) {
        validateInsuranceBilling(message, result, flowId);
      }

      if (message) {
        validateInsuranceFulfillments(message, result, flowId, actionId);
      }

      if (message) {
        validateInsurancePaymentTags(message, result, flowId, "order");
      }

      if (message) {
        validateInsuranceInitXinput(message, result, flowId);
      }
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
