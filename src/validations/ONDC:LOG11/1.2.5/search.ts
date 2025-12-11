import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";

export async function checkSearch(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  return await DomainValidators.ondclogSearch(element, sessionID, flowId, action_id);
  
}
