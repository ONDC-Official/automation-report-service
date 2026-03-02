import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateStatusOrderId, validateStatusRefId } from "../../shared/validationFactory";

const TECHNICAL_CANCELLATION_FLOW = "OnDemand_Ride_Technical_Cancellation_Flow";

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

  // For Technical Cancellation flow, validate ref_id instead of order_id
  if (flowId === TECHNICAL_CANCELLATION_FLOW) {
    validateStatusRefId(message, testResults);
  } else {
    validateStatusOrderId(message, testResults);
  }

  // Add default message if no validations ran
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated status`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}

