import { Payload, TestResult } from "../../../types/payload";
import { checkOnConfirmCommon } from "../../shared/logisticsCommonHandlers";

/** LOG10 (P2P) — isP2H2P = false */
export async function checkOnConfirm(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnConfirmCommon(element, sessionID, flowId, action_id, false);
}