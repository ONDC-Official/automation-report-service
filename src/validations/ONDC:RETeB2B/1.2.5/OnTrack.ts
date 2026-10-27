import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateTrackingObject,
  validateTrackingTags,
  validateTrackingPath,
  validateLivePollCompleteness,
} from "./trackChecks";

// See trackChecks.ts for where these rules come from and how they were calibrated — in
// short: the B2C prior art asserts nothing domain-specific for this action, so the rules are
// derived from L1's `on_track:` block and verified against the six eB2B flows that contain a
// track leg.
//
// Builds its own TestResult rather than going through a DomainValidators factory, the same
// way status.ts and track.ts do, because no `retEB2BOnTrack` factory is registered.
export default async function on_track(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result: TestResult = { response: {}, passed: [], failed: [] };
  if (element?.jsonResponse?.response) result.response = element.jsonResponse.response;

  try {
    const context = element?.jsonRequest?.context;
    const tracking = element?.jsonRequest?.message?.tracking;

    // Mirrors L1's own `_CONTINUE_: "(error_type are present)"` gate on the whole tracking
    // block: an NP that cannot track answers with an error, and holding it to a complete
    // tracking object on top of that would report the same refusal twice.
    const requestError = element?.jsonRequest?.error;
    if (requestError && Object.keys(requestError).length > 0) {
      result.passed.push(
        `on_track: answered with an error (${requestError.code ?? "no code"}), so the tracking object is not required`
      );
      return await finish(element, sessionID, flowId, result);
    }

    if (!tracking || typeof tracking !== "object") {
      result.failed.push("on_track: message.tracking is required when no error is returned");
      return await finish(element, sessionID, flowId, result);
    }

    const txnId = context?.transaction_id as string | undefined;
    let storedOrderId: any = undefined;
    let fulfillmentIds: string[] = [];

    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      storedOrderId = confirmData?.order_id;

      // tracking.id is the FULFILLMENT id, so it is checked against what the seller quoted.
      const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
      const stored = onSelectData?.fulfillments;
      fulfillmentIds = (Array.isArray(stored) ? stored : stored ? [stored] : [])
        .map((f: any) => f?.id)
        .filter(Boolean)
        .map(String);
    }

    validateTrackingObject(tracking, context, fulfillmentIds, result);
    validateTrackingTags(tracking, storedOrderId, result);
    validateTrackingPath(tracking, result);
    validateLivePollCompleteness(tracking, result);
  } catch (_) {}

  return await finish(element, sessionID, flowId, result);
}

async function finish(
  element: Payload,
  sessionID: string,
  flowId: string,
  result: TestResult
): Promise<TestResult> {
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
