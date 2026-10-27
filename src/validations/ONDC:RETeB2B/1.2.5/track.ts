import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateTrackRequest } from "./trackChecks";

// `track` is a one-field request — `{context, message: {order_id}}` — so there is genuinely
// little to assert beyond "it names the order this flow created". L1 additionally
// pattern-checks the id via its shared STATUS_ORDER anchor, which is not repeated here.
//
// Builds its own TestResult rather than going through a DomainValidators factory, the same
// way status.ts does, because no `retEB2BTrack` factory is registered — so, like status.ts,
// this leg does not get the factory's transaction-id continuity check. Flow-level timestamp
// monotonicity and bap/bpp stability still run for it via checkFlowContinuity().
export default async function track(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result: TestResult = { response: {}, passed: [], failed: [] };
  if (element?.jsonResponse?.response) result.response = element.jsonResponse.response;

  try {
    const context = element?.jsonRequest?.context;
    const txnId = context?.transaction_id as string | undefined;

    const confirmData = txnId
      ? await getActionData(sessionID, flowId, txnId, "confirm")
      : null;

    validateTrackRequest(element?.jsonRequest?.message, confirmData?.order_id, result);
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
