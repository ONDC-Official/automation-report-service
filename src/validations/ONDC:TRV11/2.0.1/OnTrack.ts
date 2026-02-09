import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateTracking } from "../../shared/validationFactory";

export default async function on_track(
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

  // Validate tracking information
  validateTracking(message, context, testResults);

  // Add default message if no validations ran
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated on_track`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}

