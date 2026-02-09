import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateTrv11Update } from "../../shared/trv11Validations";

export default async function update(
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

  // Validate update message for TRV11
  validateTrv11Update(message, testResults);

  // Add default message if no validations ran
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated update`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
