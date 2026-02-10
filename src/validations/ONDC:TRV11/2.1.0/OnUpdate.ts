import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateQuoteBreakup,
  validateTermsTags,
  validateOrderStatus,
  validateStops,
} from "./commonChecks";

export default async function on_update(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11OnUpdate(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // Validate order status
    if (order?.status) {
      validateOrderStatus(order, result, ["ACTIVE", "COMPLETE", "CANCELLED"], "on_update");
    }

    // Validate quote (fare difference scenarios)
    if (order?.quote) {
      validateQuoteBreakup(order.quote, result, "on_update");
    }

    // Validate updated fulfillments (end stop update)
    if (order?.fulfillments && Array.isArray(order.fulfillments)) {
      for (const f of order.fulfillments) {
        if (f.stops) {
          validateStops(f.stops, result, `on_update.fulfillment[${f.id}]`);
        }
        // Check for updated state
        if (f.state?.descriptor?.code) {
          result.passed.push(
            `on_update: fulfillment ${f.id} state '${f.state.descriptor.code}'`
          );
        }
      }
    }

    // 2.1.0: BAP_TERMS / BPP_TERMS
    if (order?.tags) {
      validateTermsTags(order.tags, result, "on_update");
    }

    // Validate payments (fare difference with POST-FULFILLMENT)
    if (order?.payments && Array.isArray(order.payments)) {
      for (const payment of order.payments) {
        if (payment.type === "POST-FULFILLMENT") {
          result.passed.push("on_update: POST-FULFILLMENT payment present (fare difference)");
          if (payment.status === "PAID") {
            result.passed.push("on_update: POST-FULFILLMENT payment status is PAID");
          } else if (payment.status === "NOT-PAID") {
            result.passed.push("on_update: POST-FULFILLMENT payment status is NOT-PAID");
          }
        }
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
