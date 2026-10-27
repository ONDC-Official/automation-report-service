import { Payload, TestResult } from "../../../types/payload";
import { checkOnUpdateCommon } from "../../shared/logisticsCommonHandlers";

/** LOG10 (P2P) — isP2H2P = false → no AWB, no shipping label */
export async function checkOnUpdate(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnUpdateCommon(element, sessionID, flowId, action_id, false);
}
