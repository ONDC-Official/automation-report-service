import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateIgm2Issue, validateIgm1Issue } from "../../shared/igmValidations";

export default async function issue(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const message = element?.jsonRequest?.message;
  const issue = message?.issue;
  
  // Detect IGM version by payload structure
  // IGM 1.0.0 has 'category' field, IGM 2.0.0 has 'level' field
  const isIgm1 = issue?.category !== undefined;
  
  // Initialize result directly
  const result: TestResult = { response: {}, passed: [], failed: [] };
  
  if (isIgm1) {
    // IGM 1.0.0
    validateIgm1Issue(message, result);
  } else {
    // IGM 2.0.0
    validateIgm2Issue(message, result);
  }
  
  // Add marker to confirm which validator ran
  if (result.passed.length === 0 && result.failed.length === 0) {
    result.passed.push(`IGM ${isIgm1 ? '1.0.0' : '2.0.0'} issue validation executed`);
  }
  
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
