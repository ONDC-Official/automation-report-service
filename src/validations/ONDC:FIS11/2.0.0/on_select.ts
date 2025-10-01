import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/validationFactory";

export default async function on_select(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  return await DomainValidators.fis11OnSelect(element, sessionID, flowId);
}