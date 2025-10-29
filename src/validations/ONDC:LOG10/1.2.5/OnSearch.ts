import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";

export async function checkOnSearch(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id:string
): Promise<TestResult> {
  return await DomainValidators.ondclogOnSearch(element, sessionID, flowId,action_id);
}