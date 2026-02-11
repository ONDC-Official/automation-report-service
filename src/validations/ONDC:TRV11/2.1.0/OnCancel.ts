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

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // Validate order status
    if (order?.status) {
      validateOrderStatus(order, result, ["SOFT_CANCEL", "CANCELLED"], "on_cancel");
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
        if (payment.status === "PAID" && payment.type === "POST-FULFILLMENT") {
          result.passed.push("on_cancel: POST-FULFILLMENT refund payment present");
        }
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
