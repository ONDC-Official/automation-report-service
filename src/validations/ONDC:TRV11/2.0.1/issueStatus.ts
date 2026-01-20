import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateIgm1IssueStatus, validateIgm2IssueStatus } from "../../shared/igmValidations";

export default async function issue_status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const message = element?.jsonRequest?.message;
  
  // issue_status has identical payload for both versions (just issue_id)
  // We use IGM 1.0.0 validator by default, but add version marker
  const result = await DomainValidators.igm1IssueStatus(element, sessionID, flowId, actionId);
  
  // If DomainValidators didn't populate results, call direct validation
  if (message && result.passed.length === 0 && result.failed.length === 0) {
    validateIgm1IssueStatus(message, result);
  }
  
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
