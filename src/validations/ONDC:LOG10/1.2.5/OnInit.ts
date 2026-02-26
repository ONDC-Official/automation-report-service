import { Payload, TestResult } from "../../../types/payload";
import { checkOnInitCommon } from "../../shared/logisticsCommonHandlers";

export async function checkOnInit(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnInitCommon(element, sessionID, flowId, action_id);
}
