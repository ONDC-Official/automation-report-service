import { Payload, TestResult } from "../../../types/payload";
import { checkOnConfirmCommon } from "../../shared/logisticsCommonHandlers";

/** LOG11 (P2H2P) — isP2H2P = true */
export async function checkOnConfirm(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnConfirmCommon(element, sessionID, flowId, action_id, true);
}