import { Payload, TestResult } from "../../../types/payload";
import { checkOnStatusCommon } from "../../shared/logisticsCommonHandlers";

/** LOG10 (P2P) — isP2H2P = false → no AWB, no shipping label, no pickup images check */
export async function checkOnStatus(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnStatusCommon(element, sessionID, flowId, action_id, false);
}
