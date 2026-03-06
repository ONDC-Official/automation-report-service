import { Payload, TestResult } from "../../../types/payload";
import { checkOnSearchCommon } from "../../shared/logisticsCommonHandlers";

export async function checkOnSearch(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnSearchCommon(element, sessionID, flowId, action_id);
}