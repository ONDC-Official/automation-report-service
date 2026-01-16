import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateIgm2Issue, validateIgm1Issue } from "../../shared/igmValidations";

export default async function issue(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const context = element?.jsonRequest?.context;
  const message = element?.jsonRequest?.message;
  
  // Detect IGM version from context
  // IGM 1.0.0 uses core_version, IGM 2.0.0 uses version
  const coreVersion = context?.core_version;
  const version = context?.version;
  const isIgm1 = coreVersion === "1.0.0" || (coreVersion && !version);
  
  let result: TestResult;
  
  if (isIgm1) {
    // IGM 1.0.0
    result = await DomainValidators.igm1Issue(element, sessionID, flowId, actionId);
    if (message && result.passed.length === 0 && result.failed.length === 0) {
      validateIgm1Issue(message, result);
    }
  } else {
    // IGM 2.0.0
    result = await DomainValidators.igmIssue(element, sessionID, flowId, actionId);
    if (message && result.passed.length === 0 && result.failed.length === 0) {
      validateIgm2Issue(message, result);
    }
  }
  
  // Add marker to confirm this validator ran
  if (result.passed.length === 0 && result.failed.length === 0) {
    result.passed.push(`IGM ${isIgm1 ? '1.0.0' : '2.0.0'} issue validation executed`);
  }
  
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
