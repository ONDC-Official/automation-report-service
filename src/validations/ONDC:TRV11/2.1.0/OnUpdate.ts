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

  // Delayed cancellation on_update has optional terms tags and different valid statuses
  const isDelayedCancel =
    flowId === "DELAYED_CANCELLATION_FLOW_ACCEPTED" ||
    flowId === "DELAYED_CANCELLATION_FLOW_REJECTED";

  // IntraCity_Base_Order_Update_Journey starts at update/on_update directly (no prior
  // search/confirm) — suppress false positives from the shared on_update validator
  const isBaseOrderUpdateFlow = flowId === "IntraCity_Base_Order_Update_Journey";

  // Filter base validator false positives for delayed cancellation flows
  if (isDelayedCancel && result.failed.length > 0) {
    result.failed = result.failed.filter((err: string) => {
      const lower = err.toLowerCase();
      return (
        !lower.includes("bap_terms") &&
        !lower.includes("bpp_terms") &&
        !lower.includes("payment")
      );
    });
  }

  // Filter false positives for base order update flow (standalone, no prior txn)
  if (isBaseOrderUpdateFlow && result.failed.length > 0) {
    result.failed = result.failed.filter((err: string) => {
      const lower = err.toLowerCase();
      return (
        !lower.includes("no transaction ids found") &&
        !lower.includes("quantity.selected.count") &&
        !lower.includes("billing is missing")
      );
    });
  }

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // Validate order status — delayed cancel flows only expect CANCELLED or CANCELLATION_INITIATED
    if (order?.status) {
      const allowedStatuses = isDelayedCancel
        ? ["CANCELLED", "CANCELLATION_INITIATED"]
        : ["ACTIVE", "COMPLETE", "COMPLETED", "CANCELLED", "SOFT_UPDATE", "UPDATED"];
      validateOrderStatus(order, result, allowedStatuses, "on_update");
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

    // Validate payments
    if (order?.payments && Array.isArray(order.payments)) {
      for (const payment of order.payments) {
        if (payment.type && !["PRE-ORDER", "POST-FULFILLMENT", "ON-FULFILLMENT"].includes(payment.type)) {
          result.failed.push(`on_update: payment type '${payment.type}' is not valid`);
        }
        if (payment.status && !["PAID", "NOT-PAID"].includes(payment.status)) {
          result.failed.push(`on_update: payment status '${payment.status}' is not valid`);
        }
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
