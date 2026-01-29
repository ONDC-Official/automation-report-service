import { TestResult, Payload } from "../../../types/payload";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { saveFromElement } from "../../../utils/specLoader";

export default async function on_init(
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
    if (context?.action === "on_init") {
      result.passed.push("Action is on_init");
    } else {
      result.failed.push(`Invalid action: expected on_init, got ${context?.action}`);
    }

    // Validate provider
    if (order?.provider?.id) {
      result.passed.push(`Provider ID: ${order.provider.id}`);
    }

    // Validate items with prices
    const items = order?.items;
    if (items && Array.isArray(items) && items.length > 0) {
      result.passed.push(`${items.length} item(s) in response`);
      for (const item of items) {
        if (item?.price?.value) {
          result.passed.push(`Item ${item.id} price: ${item.price.currency} ${item.price.value}`);
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
      }
    }

    // Validate payments with terms
    const payments = order?.payments;
    if (payments && Array.isArray(payments) && payments.length > 0) {
      for (const payment of payments) {
        if (payment?.type) {
          result.passed.push(`Payment type: ${payment.type}`);
        }
        if (payment?.collected_by) {
          result.passed.push(`Collected by: ${payment.collected_by}`);
        }
        if (payment?.params?.bank_code || payment?.params?.bank_account_number) {
          result.passed.push("Payment bank details present");
        }
      }
    }

    // Validate BPP_TERMS if present
    const tags = order?.tags;
    if (tags && Array.isArray(tags)) {
      const bppTerms = tags.find((t: any) => t?.descriptor?.code === "BPP_TERMS");
      if (bppTerms) {
        result.passed.push("BPP_TERMS present");
      }
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

    // Validate cancellation_terms
    if (order?.cancellation_terms && order.cancellation_terms.length > 0) {
      result.passed.push("Cancellation terms present");
    }
  } catch (error) {
    result.failed.push(`Validation error: ${error}`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
