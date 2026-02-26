import { Payload, TestResult } from "../../../types/payload";
import { checkConfirmCommon } from "../../shared/logisticsCommonHandlers";

export async function checkConfirm(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkConfirmCommon(element, sessionID, flowId, action_id);
}
