import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateOrderState, compareOrderIdContinuity } from "./commonChecks";

export default async function on_update(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.retEB2BOnUpdate(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // Covers both the Merchant-side RTO/part-cancellation flow's unsolicited on_update
    // and the buyer-initiated-return flow's on_update — be permissive on state since
    // this can land at different points of the order lifecycle.
    if (order?.state) {
      validateOrderState(order, result, ["Accepted", "In-progress", "Completed", "Cancelled"], "on_update");
    }

    // Pass through return/replacement tags without failing on mere presence
    if (order?.tags && Array.isArray(order.tags)) {
      result.passed.push(`on_update: order.tags present with ${order.tags.length} entries`);
    }

    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      compareOrderIdContinuity(order?.id, confirmData?.order_id, "on_update", result);
    }

    // TODO(RETeB2B-B2B): full return-reason-code / replacement-item validation against B2B return policy tags
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
