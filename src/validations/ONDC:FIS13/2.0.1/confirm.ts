import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { HEALTH_INSURANCE_FLOWS, MOTOR_INSURANCE_FLOWS } from "../../../utils/constants";
import {
  validateInsuranceContext,
  validateInsuranceFulfillments,
  validateInsurancePaymentTags,
  validateInsuranceConfirmXinput,
  validateInsurancePaymentParams,
} from "../../shared/healthInsuranceValidations";
import {
  validateProviderConsistency,
  validateItemConsistency,
  validateBillingConsistency,
  validatePaymentCollectedByConsistency,
  validateBuyerFinderFeeArithmetic,
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";

export default async function confirm(
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
    : await DomainValidators.fis13Confirm(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Skip required/enum validations for Health Insurance
    if (!isHealthInsurance) {
      validateInsuranceContext(context, result, flowId);

      if (message) {
        validateInsuranceFulfillments(message, result, flowId, actionId);
      }

      if (message) {
        validateInsurancePaymentTags(message, result, flowId, "order");
      }

      if (message) {
        validateInsurancePaymentParams(message, result, flowId, actionId);
      }

      if (message) {
        validateInsuranceConfirmXinput(message, result, flowId);
      }
    }

    // ── L2: BFF arithmetic (if quote is available via on_init data) ──
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const onInitData = await getActionData(sessionID, flowId, txnId, "on_init");
      const initData = await getActionData(sessionID, flowId, txnId, "init");

      // L2: Cross-action vs on_init
      if (onInitData) {
        validateProviderConsistency(message, onInitData, result, flowId, "confirm", "on_init");
        validateItemConsistency(message, onInitData, result, flowId, "confirm", "on_init");
        validatePaymentCollectedByConsistency(message, onInitData, result, flowId, "confirm", "on_init");
        validateAllContext(context, onInitData, result, flowId, "confirm", "on_init");

        // BFF check using on_init quote value against confirm payment BFF tags
        if (onInitData.quote?.price?.value && message?.order?.payments) {
          const syntheticMsg = {
            order: {
              quote: { price: { value: onInitData.quote.price.value } },
              payments: message.order.payments,
            },
          };
          validateBuyerFinderFeeArithmetic(syntheticMsg, result, flowId, "confirm");
        }
      }

      // L2: Billing consistency vs init
      if (initData) {
        validateBillingConsistency(message, initData, result, flowId, "confirm", "init");
      }

      // Validate form ID consistency if xinput is present
      const isInsuranceFlow = flowId && (HEALTH_INSURANCE_FLOWS.includes(flowId) || MOTOR_INSURANCE_FLOWS.includes(flowId));
      if (isInsuranceFlow) {
        const insuranceFlows = [...HEALTH_INSURANCE_FLOWS, ...MOTOR_INSURANCE_FLOWS];
        await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "confirm", result, insuranceFlows);
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
