import { Payload, TestResult } from "../../../types/payload";
import { checkOnCancelCommon } from "../../shared/logisticsCommonHandlers";

/** LOG10 (P2P) — isP2H2P = false → no AWB/shipping_label even when agent was assigned */
export async function checkOnCancel(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnCancelCommon(element, sessionID, flowId, action_id, false);
}
