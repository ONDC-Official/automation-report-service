import { Payload, TestResult } from "../../../types/payload";
import { checkOnTrackCommon } from "../../shared/logisticsCommonHandlers";

export async function checkOnTrack(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnTrackCommon(element, sessionID, flowId, action_id);
}