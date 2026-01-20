import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateIgm2OnIssue, validateIgm1OnIssue } from "../../shared/igmValidations";

export default async function on_issue(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const message = element?.jsonRequest?.message;
  const issue = message?.issue;
  
  // Detect IGM version by payload structure, not context
  // IGM 1.0.0 has 'issue_actions', IGM 2.0.0 has 'update_target' and 'actions'
  const isIgm1 = issue?.issue_actions !== undefined || 
                 (issue && issue.category !== undefined);
  
  let result: TestResult;
  
  if (isIgm1) {
    // IGM 1.0.0
    result = await DomainValidators.igm1OnIssue(element, sessionID, flowId, actionId);
    if (message && result.passed.length === 0 && result.failed.length === 0) {
      validateIgm1OnIssue(message, result);
    }
  } else {
    // IGM 2.0.0
    result = await DomainValidators.igmOnIssue(element, sessionID, flowId, actionId);
    if (message && result.passed.length === 0 && result.failed.length === 0) {
      validateIgm2OnIssue(message, result);
    }
  }
  
  // Add marker to confirm this validator ran
  if (result.passed.length === 0 && result.failed.length === 0) {
    result.passed.push(`IGM ${isIgm1 ? '1.0.0' : '2.0.0'} on_issue validation executed`);
  }
  
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
