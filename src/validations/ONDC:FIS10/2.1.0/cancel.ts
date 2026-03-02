import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateCancel } from "../../shared/validationFactory";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcOrderIdConsistency,
} from "../../shared/giftCardL2Validations";

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

  const message = jsonRequest?.message;

  // Validate cancel message based on action_id
  validateCancel(message, testResults, actionId, flowId);

  try {
    const ctx = jsonRequest?.context;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      // GC-ORD-003: order_id must match on_confirm
      validateGcOrderIdConsistency(message, onConfirmData, testResults, flowId, "cancel", "on_confirm");
    }
  } catch (_) { }

  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated cancel`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
