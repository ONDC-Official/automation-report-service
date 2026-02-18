import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { HEALTH_INSURANCE_FLOWS, MOTOR_INSURANCE_FLOWS } from "../../../utils/constants";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateInsuranceContext,
  validateInsuranceOrderStatus,
  validateInsuranceDocuments,
  validateInsurancePaymentParams,
  validateInsuranceOrderId,
} from "../../shared/healthInsuranceValidations";
import {
  validateAllFinancials,
  validateProviderConsistency,
  validateItemConsistency,
  validateQuoteConsistency,
  validateBillingConsistency,
  validatePaymentCollectedByConsistency,
  validateCreatedUpdatedAt,
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13OnConfirm(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Health insurance context validation
    validateInsuranceContext(context, result, flowId);

    // Health insurance order status (ACTIVE)
    if (message) {
      validateInsuranceOrderStatus(message, result, flowId);
    }

    // Health insurance order ID (Policy ID)
    if (message) {
      validateInsuranceOrderId(message, result, flowId);
    }

    // Health insurance document types (POLICY_DOC)
    if (message) {
      validateInsuranceDocuments(message, result, flowId);
    }

    // Health insurance payment params (transaction_id)
    if (message) {
      validateInsurancePaymentParams(message, result, flowId, actionId);
    }

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
      validateAllFinancials(message, result, flowId, "on_confirm");
    }

    // ── L2: Timestamp validation ──
    if (message) {
      validateCreatedUpdatedAt(message, result, flowId, "on_confirm");
    }

    // ── L2: Cross-action consistency ──
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const onInitData = await getActionData(sessionID, flowId, txnId, "on_init");
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");

      // vs on_init
      if (onInitData) {
        validateProviderConsistency(message, onInitData, result, flowId, "on_confirm", "on_init");
        validateItemConsistency(message, onInitData, result, flowId, "on_confirm", "on_init");
        validateQuoteConsistency(message, onInitData, result, flowId, "on_confirm", "on_init");
        validatePaymentCollectedByConsistency(message, onInitData, result, flowId, "on_confirm", "on_init");
      }

      // vs confirm
      if (confirmData) {
        validateBillingConsistency(message, confirmData, result, flowId, "on_confirm", "confirm");
        validateAllContext(context, confirmData, result, flowId, "on_confirm", "confirm");
      }

      // Validate form ID consistency if xinput is present
      const isInsuranceFlow = flowId && (HEALTH_INSURANCE_FLOWS.includes(flowId) || MOTOR_INSURANCE_FLOWS.includes(flowId));
      if (isInsuranceFlow) {
        const insuranceFlows = [...HEALTH_INSURANCE_FLOWS, ...MOTOR_INSURANCE_FLOWS];
        await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_confirm", result, insuranceFlows);
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
