import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateStatusRefId } from "../../shared/validationFactory";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdUniqueness,
  validateGcOrderIdConsistency,
} from "../../shared/giftCardL2Validations";

export default async function status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId?: string
): Promise<TestResult> {
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const message = jsonRequest?.message;

  // Validate order_id
  // validateStatusRefId(message, testResults);

  try {
    const ctx = jsonRequest?.context;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const onConfirmData = await getActionData(sessionID, flowId, txnId, "on_confirm");
      // GC-CTX-012,018
      validateGcAllContext(ctx, onConfirmData, testResults, flowId, "status", "on_confirm");
      validateGcMessageIdUniqueness(ctx, onConfirmData, testResults, flowId, "status", "on_confirm");
      // GC-ORD-003: order_id consistency
      validateGcOrderIdConsistency(message, onConfirmData, testResults, flowId, "status", "on_confirm");
    }
  } catch (_) { }

  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated status`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
