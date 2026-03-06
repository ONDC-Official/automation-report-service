import { Payload, TestResult } from "../../../types/payload";
import { checkOnUpdateCommon } from "../../shared/logisticsCommonHandlers";

/** LOG11 (P2H2P) — isP2H2P = true → requires AWB + shipping label */
export async function checkOnUpdate(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnUpdateCommon(element, sessionID, flowId, action_id, true);
}
