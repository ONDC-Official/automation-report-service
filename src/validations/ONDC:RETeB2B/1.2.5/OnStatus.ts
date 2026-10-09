import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateOrderState, validateFulfillmentState } from "./commonChecks";

export default async function on_status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.retEB2BOnStatus(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // on_status can be polled at any point in the order lifecycle — be permissive on
    // the exact state rather than pinning to one value.
    if (order?.state) {
      validateOrderState(
        order,
        result,
        ["Created", "Accepted", "In-progress", "Completed", "Cancelled"],
        "on_status"
      );
    }

    if (order?.fulfillments && Array.isArray(order.fulfillments)) {
      validateFulfillmentState(
        order.fulfillments,
        result,
        ["Pending", "Packed", "Agent-assigned", "Order-picked-up", "Out-for-delivery", "Order-delivered", "Cancelled"],
        "on_status"
      );
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
