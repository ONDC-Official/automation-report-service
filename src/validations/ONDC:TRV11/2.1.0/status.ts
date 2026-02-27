import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateTrv11Status } from "../../shared/trv11Validations";

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

  // Validate status - supports both order_id and ref_id
  validateTrv11Status(message, testResults);

  // Add default message if no validations ran
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated status`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
