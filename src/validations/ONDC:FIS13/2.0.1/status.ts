import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateStatusOrderId } from "../../shared/validationFactory";
import { validateInsuranceContext } from "../../shared/healthInsuranceValidations";
import { HEALTH_INSURANCE_FLOWS } from "../../../utils/constants";
import { getActionData } from "../../../services/actionDataService";
import {
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";

export default async function status(
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

  // Validate context for health insurance
  if (flowId && HEALTH_INSURANCE_FLOWS.includes(flowId)) {
    validateInsuranceContext(context, testResults, flowId);
  }

  // Validate status message — spec requires order_id (not ref_id)
  validateStatusOrderId(message, testResults);

  // ── L2: Context integrity vs on_confirm ──
  try {
    const txnId = context?.transaction_id as string | undefined;
    if (txnId && flowId && HEALTH_INSURANCE_FLOWS.includes(flowId)) {
      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      if (onConfirmData) {
        validateAllContext(context, onConfirmData, testResults, flowId, "status", "on_confirm");
      }
    }
  } catch (_) { }

  // Add default message if no validations ran
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated status`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
