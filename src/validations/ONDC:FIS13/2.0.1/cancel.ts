import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateCancel } from "../../shared/validationFactory";
import { getActionData } from "../../../services/actionDataService";
import {
  validateInsuranceContext,
} from "../../shared/healthInsuranceValidations";
import {
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";
import { HEALTH_INSURANCE_FLOWS } from "../../../utils/constants";

export default async function cancel(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const context = jsonRequest?.context;
  const message = jsonRequest?.message;

  const isHealthInsurance = !!flowId && HEALTH_INSURANCE_FLOWS.includes(flowId);

  // Skip required/enum validations for Health Insurance
  if (!isHealthInsurance) {
    validateInsuranceContext(context, testResults, flowId);

    validateCancel(message, testResults, actionId, flowId);
  }

  // ── L2: Context integrity vs on_confirm ──
  try {
    const txnId = context?.transaction_id as string | undefined;
    if (txnId && flowId && HEALTH_INSURANCE_FLOWS.includes(flowId)) {
      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      if (onConfirmData) {
        validateAllContext(context, onConfirmData, testResults, flowId, "cancel", "on_confirm");
      }
    }
  } catch (_) { }

  // Add default message if no validations ran
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated cancel`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
