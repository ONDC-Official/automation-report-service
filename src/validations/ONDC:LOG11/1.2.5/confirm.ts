import { TestResult, Payload } from "../../../types/payload";
import { validateUnified } from "../../shared/unifiedValidations";

export async function checkConfirm(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  return await validateUnified(element, sessionID, flowId, {
    runCommonValidations: true,
    validateOrderTimestamps: true,
    validateReadyToShip: true,
    validateCODSettlement: true,
  });
}
