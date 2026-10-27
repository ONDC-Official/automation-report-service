import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";

export async function checkSelect(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id:string
): Promise<TestResult> {
  return await DomainValidators.ondclogSelect(element, sessionID, flowId,action_id);
}
