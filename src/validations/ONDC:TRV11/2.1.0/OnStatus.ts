import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateTicketFulfillment,
  validateTermsTags,
  validateOrderStatus,
  validateFulfillmentState,
} from "./commonChecks";

export default async function on_status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11OnStatus(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // Validate order status
    if (order?.status) {
      validateOrderStatus(order, result, ["ACTIVE", "COMPLETE", "COMPLETED", "CANCELLED"], "on_status");
    }

    // 2.1.0: CHECKED_IN / CHECKED_OUT fulfillment states
    if (order?.fulfillments && Array.isArray(order.fulfillments)) {
      validateFulfillmentState(
        order.fulfillments,
        result,
        ["INACTIVE", "ACTIVE", "CHECKED_IN", "CHECKED_OUT", "COMPLETED"],
        "on_status"
      );

      // Validate TICKET fulfillments
      validateTicketFulfillment(order.fulfillments, result, "on_status");
    }

    // 2.1.0: BAP_TERMS / BPP_TERMS in order.tags
    if (order?.tags) {
      validateTermsTags(order.tags, result, "on_status");
    }

    // Validate payments status
    if (order?.payments && Array.isArray(order.payments)) {
      for (const payment of order.payments) {
        if (payment.status && !["PAID", "NOT-PAID"].includes(payment.status)) {
          result.failed.push(`on_status: payment.status '${payment.status}' is invalid`);
        }
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
