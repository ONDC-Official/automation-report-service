import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/validationFactory";

export async function checkSelect(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  return await DomainValidators.ondclogSelect(element, sessionID, flowId);
}
