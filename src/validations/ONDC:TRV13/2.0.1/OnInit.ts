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

    // Validate billing details
    const billing = order?.billing;
    if (!billing) {
      result.failed.push("message.order.billing is missing");
    } else {
      if (!billing.name) result.failed.push("billing.name is missing");
      if (!billing.phone) result.failed.push("billing.phone is missing");
      if (!billing.email) result.failed.push("billing.email is missing");
      const address = billing.address;
      if (!address) {
        result.failed.push("billing.address is missing");
      } else {
        if (!address.city) {
          result.failed.push("message.order.billing is missing city name");
        }
        if (!address.state) {
          result.failed.push("message.order.billing is missing state name");
        }
        if (!address.name) {
          result.failed.push("message.order.billing is missing organization name");
        }
      }
    }

    // Validate provider
    if (order?.provider?.id) {
      result.passed.push(`Provider ID: ${order.provider.id}`);
    }

    if (order?.provider?.locations) {
      result.failed.push("provider.locations is being sent additionally");
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
        if (item?.price?.value) {
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

        const hasAddon = breakup.some((b: any) => {
          const title = String(b.title || '').toLowerCase();
          const type = String(b['@ondc/org/title_type'] || '').toLowerCase();
          return title.includes('add-on') || title.includes('addon') || title.includes('add_on') || type.includes('add-on') || type.includes('addon') || type.includes('add_on') || type === 'ancillary';
        });
        if (!hasAddon) {
          result.failed.push("quote.breakup is incorrect as it does not include Add-ons");
        } else {
          result.passed.push("quote.breakup includes Add-ons");
        }

        const hasTax = breakup.some((b: any) => {
          const title = String(b.title || '').toLowerCase();
          const type = String(b['@ondc/org/title_type'] || '').toLowerCase();
          return title.includes('gst') || title.includes('tax') || type.includes('gst') || type.includes('tax');
        });
        if (!hasTax) {
          result.failed.push("quote.breakup is incorrect as it does not include Service Tax/GST");
        } else {
          result.passed.push("quote.breakup includes Service Tax/GST");
        }

        const hasMeal = breakup.some((b: any) => {
          const title = String(b.title || '').toLowerCase();
          const type = String(b['@ondc/org/title_type'] || '').toLowerCase();
          return title.includes('meal') || title.includes('breakfast') || title.includes('lunch') || title.includes('dinner') || type.includes('meal');
        });
        if (!hasMeal) {
          result.failed.push("quote.breakup is incorrect as it does not include Meal Inclusion Charges");
        } else {
          result.passed.push("quote.breakup includes Meal Inclusion Charges");
        }
      } else {
        result.failed.push("quote.breakup is missing or empty");
      }
    }

    // Validate payments with terms
    const payments = order?.payments;
    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      result.failed.push("Payment object is incorrect; please refer to the Swagger documentation (payments array is missing or empty)");
    } else {
      payments.forEach((payment: any, pIdx: number) => {
        if (!payment.id) {
          result.failed.push(`Payment[${pIdx}] is missing 'id'`);
        }
        if (!payment.collected_by) {
          result.failed.push(`Payment[${pIdx}] is missing 'collected_by'`);
        } else if (!["BAP", "BPP"].includes(payment.collected_by)) {
          result.failed.push(`Payment[${pIdx}].collected_by must be BAP or BPP, got: ${payment.collected_by}`);
        }
        if (!payment.type) {
          result.failed.push(`Payment[${pIdx}] is missing 'type'`);
        } else if (!["PRE-ORDER", "ON-FULFILLMENT", "PART-PAYMENT"].includes(payment.type)) {
          result.failed.push(`Payment[${pIdx}].type must be PRE-ORDER, ON-FULFILLMENT, or PART-PAYMENT, got: ${payment.type}`);
        }
        if (!payment.status) {
          result.failed.push(`Payment[${pIdx}] is missing 'status'`);
        } else if (!["NOT-PAID", "PAID"].includes(payment.status)) {
          result.failed.push(`Payment[${pIdx}].status must be NOT-PAID or PAID, got: ${payment.status}`);
        }

        // Validate params
        if (payment.type !== "PART-PAYMENT") {
          if (!payment.params) {
            result.failed.push(`Payment[${pIdx}] is missing 'params'`);
          } else {
            if (!payment.params.amount) {
              result.failed.push(`Payment[${pIdx}].params is missing 'amount'`);
            }
            if (!payment.params.currency) {
              result.failed.push(`Payment[${pIdx}].params is missing 'currency'`);
            }
          }
        }
      });
    }

    // Validate BAP_TERMS & BPP_TERMS
    let allTags: any[] = [];
    if (order?.tags && Array.isArray(order.tags)) {
      allTags.push(...order.tags);
    }
    if (payments && Array.isArray(payments)) {
      payments.forEach((p: any) => {
        if (p.tags && Array.isArray(p.tags)) {
          allTags.push(...p.tags);
        }
      });
    }

    const bapTerms = allTags.find((t: any) => t?.descriptor?.code === "BAP_TERMS");
    const bppTerms = allTags.find((t: any) => t?.descriptor?.code === "BPP_TERMS");

    if (!bapTerms) {
      result.failed.push("BAP terms are completely missing");
    } else {
      result.passed.push("BAP_TERMS tag is present");
      if (!bapTerms.list || !Array.isArray(bapTerms.list) || bapTerms.list.length === 0) {
        result.failed.push("BAP terms list is missing or empty");
      } else {
        const requiredBapFields = [
          "BUYER_FINDER_FEES_TYPE",
          "BUYER_FINDER_FEES_PERCENTAGE",
          "SETTLEMENT_TYPE",
          "DELAY_INTEREST",
          "STATIC_TERMS",
          "OFFLINE_CONTRACT",
        ];
        requiredBapFields.forEach((field) => {
          const item = bapTerms.list.find((i: any) => i?.descriptor?.code === field);
          if (!item || !item.value) {
            result.failed.push(`BAP_TERMS: ${field} is missing or incorrect`);
          }
        });
      }
    }

    if (!bppTerms) {
      result.failed.push("BPP terms are incorrect (completely missing)");
    } else {
      result.passed.push("BPP_TERMS tag is present");
      if (!bppTerms.list || !Array.isArray(bppTerms.list) || bppTerms.list.length === 0) {
        result.failed.push("BPP terms are incorrect: list is missing or empty");
      } else {
        const requiredBppFields = [
          "BUYER_FINDER_FEES_TYPE",
          "BUYER_FINDER_FEES_PERCENTAGE",
          "SETTLEMENT_WINDOW",
          "SETTLEMENT_BASIS",
          "MANDATORY_ARBITRATION",
          "COURT_JURISDICTION",
          "STATIC_TERMS",
          "SETTLEMENT_AMOUNT",
          "OFFLINE_CONTRACT",
        ];
        requiredBppFields.forEach((field) => {
          const item = bppTerms.list.find((i: any) => i?.descriptor?.code === field);
          if (!item || !item.value) {
            result.failed.push(`BPP terms are incorrect: ${field} is missing or incorrect`);
          }
        });
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
