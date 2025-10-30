import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/validationFactory";

export async function checkSearch(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  return await DomainValidators.nic2004Search(element, sessionID, flowId);
}
