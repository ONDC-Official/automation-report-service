import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateQuoteBreakup,
  validateTermsTags,
  validateOrderStatus,
} from "./commonChecks";

export default async function on_cancel(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11OnCancel(element, sessionID, flowId, actionId);

  // Filter out false positives from shared validator
  // Issue 1: Shared validator requires only "CANCELLED" status, but TRV11 allows SOFT_CANCEL, CANCELLED, CANCELLATION_INITIATED
  // Issue 2: Shared validator has inverted logic for cancellation object - fails when present
  const message = element?.jsonRequest?.message;
  const order = message?.order;
  
  const isDelayedCancel =
    flowId === "DELAYED_CANCELLATION_FLOW_ACCEPTED" ||
    flowId === "DELAYED_CANCELLATION_FLOW_REJECTED";

  if (result.failed.length > 0) {
    const filteredErrors = result.failed.filter((error: string) => {
      const lower = error.toLowerCase();

      // For delayed cancellation flows, remove any order-status error from the
      // base validator — we re-apply validateOrderStatus ourselves below
      if (isDelayedCancel && (lower.includes("order status") || lower.includes("order.status"))) {
        return false;
      }

      // Remove "Cancellation information is missing" when cancellation IS present
      // (inverted logic bug in shared validator)
      if (lower.includes("cancellation information is missing") && order?.cancellation) {
        return false;
      }

      return true;
    });

    result.failed = filteredErrors;
  }

  try {
    // Validate order status
    if (order?.status) {
      validateOrderStatus(order, result, ["SOFT_CANCEL", "CANCELLED", "CANCELLATION_INITIATED"], "on_cancel");
    }

    // Validate cancellation terms
    if (order?.cancellation_terms && Array.isArray(order.cancellation_terms)) {
      result.passed.push(
        `on_cancel: cancellation_terms present with ${order.cancellation_terms.length} entries`
      );

      // Check for refund details in cancellation_terms
      for (const term of order.cancellation_terms) {
        if (term?.cancellation_fee?.percentage) {
          result.passed.push(
            `on_cancel: cancellation fee percentage '${term.cancellation_fee.percentage}' specified`
          );
        }
        if (term?.cancellation_fee?.amount?.value) {
          result.passed.push(
            `on_cancel: cancellation fee amount '${term.cancellation_fee.amount.value}' specified`
          );
        }
      }
    }

    // Validate quote with REFUND breakup
    if (order?.quote) {
      validateQuoteBreakup(order.quote, result, "on_cancel");

      // Check for REFUND entry in breakup
      const breakup = order.quote.breakup || [];
      const refundEntry = breakup.find(
        (b: any) => b?.title === "REFUND" || b?.item?.descriptor?.code === "REFUND"
      );
      if (refundEntry) {
        result.passed.push("on_cancel: REFUND entry found in quote breakup");
      }
    }

    // 2.1.0: BAP_TERMS / BPP_TERMS in order.tags
    if (order?.tags) {
      validateTermsTags(order.tags, result, "on_cancel");
    }

    // Validate payments for refund
    if (order?.payments && Array.isArray(order.payments)) {
      for (const payment of order.payments) {
        if (payment.type && !["PRE-ORDER", "POST-FULFILLMENT", "ON-FULFILLMENT"].includes(payment.type)) {
          result.failed.push(`on_cancel: payment type '${payment.type}' is not valid`);
        }
        if (payment.status && !["PAID", "NOT-PAID"].includes(payment.status)) {
          result.failed.push(`on_cancel: payment status '${payment.status}' is not valid`);
        }
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
