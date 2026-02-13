import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { HEALTH_INSURANCE_FLOWS, MOTOR_INSURANCE_FLOWS } from "../../../utils/constants";
import {
  validateInsuranceContext,
  validateInsurancePaymentTags,
} from "../../shared/healthInsuranceValidations";
import {
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";
import { getActionData } from "../../../services/actionDataService";

export default async function search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13Search(element, sessionID, flowId, actionId);

  const context = element?.jsonRequest?.context;
  const message = element?.jsonRequest?.message;
  const isInsuranceFlow = flowId && (HEALTH_INSURANCE_FLOWS.includes(flowId) || MOTOR_INSURANCE_FLOWS.includes(flowId));

  // Health insurance context validation
  validateInsuranceContext(context, result, flowId);

  // Health insurance payment tags (BUYER_FINDER_FEES, SETTLEMENT_TERMS)
  if (message) {
    validateInsurancePaymentTags(message, result, flowId, "search");
  }

  // Validate form ID consistency if xinput is present
  try {
    const txnId = context?.transaction_id as string | undefined;
    if (txnId && message && isInsuranceFlow) {
      const insuranceFlows = [...HEALTH_INSURANCE_FLOWS, ...MOTOR_INSURANCE_FLOWS];
      await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "search", result, insuranceFlows);
    }
  } catch (_) { }

  // ── L2: Context integrity ──
  try {
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const priorSearch = await getActionData(sessionID, flowId, txnId, "search");
      if (priorSearch) {
        validateAllContext(context, priorSearch, result, flowId, "search", "prior_search");
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
