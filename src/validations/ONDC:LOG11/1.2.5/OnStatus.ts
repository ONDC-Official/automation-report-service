import { Payload, TestResult } from "../../../types/payload";
import { checkOnStatusCommon } from "../../shared/logisticsCommonHandlers";

/** LOG11 (P2H2P) — isP2H2P = true → requires AWB + shipping label + pickup images */
export async function checkOnStatus(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnStatusCommon(element, sessionID, flowId, action_id, true);
}
