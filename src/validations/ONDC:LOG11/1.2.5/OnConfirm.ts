import { TestResult, Payload } from "../../../types/payload";
import { validateUnified } from "../../shared/unifiedValidations";

export async function checkOnConfirm(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  return await validateUnified(element, sessionID, flowId, {
    runCommonValidations: true,
    validateFulfillmentTimestamps: true,
  });
}