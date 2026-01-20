import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateIgm1OnIssueStatus, validateIgm2OnIssueStatus } from "../../shared/igmValidations";

export default async function on_issue_status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const message = element?.jsonRequest?.message;
  const issue = message?.issue;
  
  // Detect IGM version by payload structure
  // IGM 1.0.0 has 'issue_actions', IGM 2.0.0 has 'level' and 'update_target'
  const isIgm1 = issue?.issue_actions !== undefined;
  
  // Initialize result directly
  const result: TestResult = { response: {}, passed: [], failed: [] };
  
  if (isIgm1) {
    // IGM 1.0.0
    validateIgm1OnIssueStatus(message, result);
  } else {
    // IGM 2.0.0
    validateIgm2OnIssueStatus(message, result);
  }
  
  // Add marker to confirm which validator ran
  if (result.passed.length === 0 && result.failed.length === 0) {
    result.passed.push(`IGM ${isIgm1 ? '1.0.0' : '2.0.0'} on_issue_status validation executed`);
  }
  
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
