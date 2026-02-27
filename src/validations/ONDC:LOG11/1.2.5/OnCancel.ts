import { Payload, TestResult } from "../../../types/payload";
import { checkOnCancelCommon } from "../../shared/logisticsCommonHandlers";

/** LOG11 (P2H2P) — isP2H2P = true → AWB/shipping_label required when agent was assigned pre-cancel */
export async function checkOnCancel(
  element: Payload, sessionID: string, flowId: string, action_id: string
): Promise<TestResult> {
  return checkOnCancelCommon(element, sessionID, flowId, action_id, true);
}
