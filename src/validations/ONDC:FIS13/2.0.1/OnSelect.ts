import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { HEALTH_INSURANCE_FLOWS, MOTOR_INSURANCE_FLOWS } from "../../../utils/constants";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateInsuranceContext,
  validateBreakupTitleEnum,
  validateInsuranceOnSelectXinput,
} from "../../shared/healthInsuranceValidations";
import {
  validateQuoteBreakupSum,
  validateBuyerFinderFeeArithmetic,
  validateProviderConsistency,
  validateItemConsistency,
  validateAllContext,
  validateBreakupItemPriceIntegrity,
} from "../../shared/healthInsuranceL2Validations";

export default async function on_select(
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
    : await DomainValidators.fis13OnSelect(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Skip required/enum validations for Health Insurance
    if (!isHealthInsurance) {
      validateInsuranceContext(context, result, flowId);

      if (message) {
        validateBreakupTitleEnum(message, result, flowId);
      }

      if (message) {
        validateInsuranceOnSelectXinput(message, result, flowId);
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
      validateQuoteBreakupSum(message, result, flowId, "on_select");
      validateBuyerFinderFeeArithmetic(message, result, flowId, "on_select");
      validateBreakupItemPriceIntegrity(message, result, flowId, "on_select");
    }

    // ── L2: Cross-action consistency vs select ──
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const selectData = await getActionData(sessionID, flowId, txnId, "select");
      if (selectData) {
        validateProviderConsistency(message, selectData, result, flowId, "on_select", "select");
        validateItemConsistency(message, selectData, result, flowId, "on_select", "select");
        validateAllContext(context, selectData, result, flowId, "on_select", "select");
      }

      // Validate form ID consistency if xinput is present
      const isInsuranceFlow = flowId && (HEALTH_INSURANCE_FLOWS.includes(flowId) || MOTOR_INSURANCE_FLOWS.includes(flowId));
      if (isInsuranceFlow) {
        const insuranceFlows = [...HEALTH_INSURANCE_FLOWS, ...MOTOR_INSURANCE_FLOWS];
        await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_select", result, insuranceFlows);
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
