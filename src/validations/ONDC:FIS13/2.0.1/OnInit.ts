import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { HEALTH_INSURANCE_FLOWS, MOTOR_INSURANCE_FLOWS } from "../../../utils/constants";
import {
  validateInsuranceContext,
  validateInsurancePaymentParams,
  validateInsuranceFulfillments,
  validateInsuranceOnInitExtras,
} from "../../shared/healthInsuranceValidations";
import {
  validateAllFinancials,
  validateProviderConsistency,
  validateItemConsistency,
  validateQuoteConsistency,
  validatePaymentCollectedByConsistency,
  validateSettlementTermsConsistency,
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";

export default async function on_init(
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
    : await DomainValidators.fis13OnInit(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Skip required/enum validations for Health Insurance
    if (!isHealthInsurance) {
      validateInsuranceContext(context, result, flowId);

      if (message) {
        validateInsurancePaymentParams(message, result, flowId, actionId);
      }

      if (message) {
        validateInsuranceFulfillments(message, result, flowId, actionId);
      }

      if (message) {
        validateInsuranceOnInitExtras(message, result, flowId);
      }
    }

    // Quote math validation (keep — financial, not required/enum)
    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
    }

    // ── L2: Financial validations ──
    if (message) {
      validateAllFinancials(message, result, flowId, "on_init");
    }

    // ── L2: Cross-action consistency vs on_select ──
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
      if (onSelectData) {
        validateProviderConsistency(message, onSelectData, result, flowId, "on_init", "on_select");
        validateItemConsistency(message, onSelectData, result, flowId, "on_init", "on_select");
        validateQuoteConsistency(message, onSelectData, result, flowId, "on_init", "on_select");
        validatePaymentCollectedByConsistency(message, onSelectData, result, flowId, "on_init", "on_select");
        validateSettlementTermsConsistency(message, onSelectData, result, flowId, "on_init", "on_select");
        validateAllContext(context, onSelectData, result, flowId, "on_init", "on_select");
      }

      // Also compare vs init
      const initData = await getActionData(sessionID, flowId, txnId, "init");
      if (initData) {
        validateProviderConsistency(message, initData, result, flowId, "on_init", "init");
        validateItemConsistency(message, initData, result, flowId, "on_init", "init");
      }

      // Validate form ID consistency if xinput is present
      const isInsuranceFlow = flowId && (HEALTH_INSURANCE_FLOWS.includes(flowId) || MOTOR_INSURANCE_FLOWS.includes(flowId));
      if (isInsuranceFlow) {
        const insuranceFlows = [...HEALTH_INSURANCE_FLOWS, ...MOTOR_INSURANCE_FLOWS];
        await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_init", result, insuranceFlows);
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
