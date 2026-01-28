import { TestResult, Payload } from "../../../types/payload";
import { validateOrderQuote } from "../../shared/quoteValidations";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) result.response = jsonResponse.response;

  try {
    const context = jsonRequest?.context;
    const message = jsonRequest?.message;
    const order = message?.order;

    // Validate domain
    if (context?.domain === "ONDC:TRV13") {
      result.passed.push("Domain is ONDC:TRV13");
    } else {
      result.failed.push(`Invalid domain: expected ONDC:TRV13, got ${context?.domain}`);
    }

    // Validate action
    if (context?.action === "on_confirm") {
      result.passed.push("Action is on_confirm");
    } else {
      result.failed.push(`Invalid action: expected on_confirm, got ${context?.action}`);
    }

    // Validate order ID
    if (order?.id) {
      result.passed.push(`Order ID: ${order.id}`);
    } else {
      result.failed.push("Order ID is missing");
    }

    // Validate order state
    if (order?.state) {
      const validStates = ["ACTIVE", "COMPLETE", "CANCELLED"];
      if (validStates.includes(order.state)) {
        result.passed.push(`Order state: ${order.state}`);
      } else {
        result.failed.push(`Invalid order state: ${order.state}`);
      }
    }

    // Validate provider
    if (order?.provider?.id) {
      result.passed.push(`Provider ID: ${order.provider.id}`);
    }

    // Validate items
    const items = order?.items;
    if (items && Array.isArray(items) && items.length > 0) {
      result.passed.push(`${items.length} item(s) confirmed`);
    }

    // Validate quote
    const quote = order?.quote;
    if (quote?.price?.value) {
      result.passed.push(`Total quote: ${quote.price.currency} ${quote.price.value}`);
    }

    // Validate fulfillments
    const fulfillments = order?.fulfillments;
    if (fulfillments && Array.isArray(fulfillments) && fulfillments.length > 0) {
      const fulfillment = fulfillments[0];
      if (fulfillment?.id) {
        result.passed.push(`Fulfillment ID: ${fulfillment.id}`);
      }
      if (fulfillment?.state?.descriptor?.code) {
        result.passed.push(`Fulfillment state: ${fulfillment.state.descriptor.code}`);
      }
    }

    // Validate payments
    const payments = order?.payments;
    if (payments && Array.isArray(payments) && payments.length > 0) {
      for (const payment of payments) {
        if (payment?.status) {
          result.passed.push(`Payment status: ${payment.status}`);
        }
      }
    }

    // Validate created_at and updated_at
    if (order?.created_at) {
      result.passed.push("Order created_at present");
    }
    if (order?.updated_at) {
      result.passed.push("Order updated_at present");
    }

    // Use shared quote validation
    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
    }
  } catch (error) {
    result.failed.push(`Validation error: ${error}`);
  }

  return result;
}
