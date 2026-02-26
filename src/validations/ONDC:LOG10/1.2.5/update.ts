import { Payload, TestResult } from "../../../types/payload";
import { checkUpdateCommon } from "../../shared/logisticsCommonHandlers";

export async function checkUpdate(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkUpdateCommon(element, sessionID, flowId, action_id);
}
