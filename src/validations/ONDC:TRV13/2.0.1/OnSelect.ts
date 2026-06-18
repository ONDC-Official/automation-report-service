import { TestResult, Payload } from "../../../types/payload";
import { validateOrderQuote } from "../../shared/quoteValidations";

export default async function on_select(
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
    if (context?.action === "on_select") {
      result.passed.push("Action is on_select");
    } else {
      result.failed.push(`Invalid action: expected on_select, got ${context?.action}`);
    }

    // Validate order.tags
    if (order?.tags) {
      result.failed.push("message.order.tags is being sent additionally");
    }

    // Validate provider
    if (order?.provider?.id) {
      result.passed.push(`Provider ID: ${order.provider.id}`);
    }

    if (order?.provider?.locations) {
      result.failed.push("provider.locations is being sent additionally");
    }

    if (order?.provider?.time) {
      result.failed.push("provider.time is being sent additionally");
    }

    if (!order?.provider?.tags || !Array.isArray(order.provider.tags) || order.provider.tags.length === 0) {
      result.failed.push("provider.tags are missing");
    } else {
      result.passed.push("provider.tags are present");
    }

    // Validate items with prices
    const items = order?.items;
    if (items && Array.isArray(items) && items.length > 0) {
      result.passed.push(`${items.length} item(s) in response`);
      for (const item of items) {
        if (item?.price?.value && item?.price?.currency) {
          result.passed.push(`Item ${item.id} price: ${item.price.currency} ${item.price.value}`);
        }

        // Validate item.tags
        if (!item.tags || !Array.isArray(item.tags) || item.tags.length === 0) {
          result.failed.push("item.tags are missing");
        } else {
          result.passed.push(`Item ${item.id} tags are present`);
        }

        // Validate additional fields on item
        if (item.quantity?.selected?.count !== undefined) {
          result.failed.push("item.quantity.selected.count is being sent additionally");
        }
        if (item.location_id !== undefined) {
          result.failed.push("item.location_id is being sent additionally");
        }
        if (item.fulfillment_id !== undefined) {
          result.failed.push("item.fulfillment_id is being sent additionally");
        }
      }
    }

    // Validate quote
    const quote = order?.quote;
    if (quote) {
      if (quote?.price?.value && quote?.price?.currency) {
        result.passed.push(`Total quote: ${quote.price.currency} ${quote.price.value}`);
      }

      // Validate quote breakup
      const breakup = quote?.breakup;
      if (breakup && Array.isArray(breakup) && breakup.length > 0) {
        result.passed.push(`Quote has ${breakup.length} breakup item(s)`);
        
        // Validate breakup total matches quote price
        let breakupTotal = 0;
        for (const item of breakup) {
          const value = parseFloat(item?.price?.value || "0");
          breakupTotal += value;
        }
        const quoteValue = parseFloat(quote?.price?.value || "0");
        if (Math.abs(breakupTotal - quoteValue) < 0.01) {
          result.passed.push("Quote breakup total matches quote price");
        } else {
          result.failed.push(`Quote breakup total (${breakupTotal}) doesn't match quote price (${quoteValue})`);
        }
      }
    }

    // Validate fulfillments
    const fulfillments = order?.fulfillments;
    if (fulfillments && Array.isArray(fulfillments) && fulfillments.length > 0) {
      result.passed.push(`${fulfillments.length} fulfillment(s) in response`);
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
