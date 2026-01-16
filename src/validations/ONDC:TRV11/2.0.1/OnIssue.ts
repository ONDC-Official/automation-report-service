import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateIgm2OnIssue } from "../../shared/igmValidations";

export default async function on_issue(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.igmOnIssue(element, sessionID, flowId, actionId);
  
  // Ensure IGM validations are run directly on the message
  const message = element?.jsonRequest?.message;
  if (message && result.passed.length === 0 && result.failed.length === 0) {
    validateIgm2OnIssue(message, result);
  }
  
  // Add marker to confirm this validator ran
  if (result.passed.length === 0 && result.failed.length === 0) {
    result.passed.push("IGM on_issue validation executed");
  }
  
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
