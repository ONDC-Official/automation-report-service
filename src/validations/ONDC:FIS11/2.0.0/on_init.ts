import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";

export default async function on_init(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  return await DomainValidators.fis11OnInit(element, sessionID, flowId);
}