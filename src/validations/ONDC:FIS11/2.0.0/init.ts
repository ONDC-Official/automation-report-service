import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";

export default async function init(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  return await DomainValidators.fis11Init(element, sessionID, flowId);
}