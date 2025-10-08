import assert from "assert";
import { TestResult } from "../../types/payload";
import { hasTwoOrLessDecimalPlaces } from "../../utils/constants";

/**
 * Interface for quote breakup items
 */
export interface QuoteBreakupItem {
  // FIS11 may put price directly or under item.price
  price?: { value: string };
  item?: { price?: { value: string }; id?: string };
  // Two alternative label fields across specs
  "@ondc/org/title_type"?: string;
  title?: string;
  // Optional linkage to items by id in some specs
  "@ondc/org/item_id"?: string;
}

/**
 * Interface for quote structure
 */
export interface Quote {
  price: { value: string };
  breakup: QuoteBreakupItem[];
}

/**
 * Configuration for quote validation
 */
export interface QuoteValidationConfig {
  /** Whether to validate decimal places */
  validateDecimalPlaces?: boolean;
  /** Whether to validate tax presence */
  validateTaxPresence?: boolean;
  /** Whether to validate quote total matches breakup total */
  validateTotalMatch?: boolean;
  /** Whether to validate COD breakup for COD flow */
  validateCODBreakup?: boolean;
  /** Whether to validate item id/price consistency between order.items and quote.breakup */
  validateItemPriceConsistency?: boolean;
  /** Flow ID to determine specific validations */
  flowId?: string;
}

/**
 * Validates quote structure and pricing
 */
export function validateQuote(
  quote: Quote,
  testResults: TestResult,
  config: QuoteValidationConfig = {}
): void {
  
  const getBreakupLabel = (b: QuoteBreakupItem): string => {
    const raw = b["@ondc/org/title_type"] || b.title || "";
    return typeof raw === "string" ? raw.toLowerCase() : "";
  };
  const getBreakupPriceValue = (b: QuoteBreakupItem): string | undefined => {
    return b.price?.value ?? b.item?.price?.value;
  };

  if (config.validateDecimalPlaces) {
    try {
      assert.ok(
        hasTwoOrLessDecimalPlaces(quote.price.value),
        "Quote price value should not have more than 2 decimal places"
      );
      testResults.passed.push("Quote price decimal validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }

  let totalBreakup = 0;
  let taxPresent = false;

  // Validate breakup items
  quote.breakup.forEach((breakup: QuoteBreakupItem) => {
    const label = getBreakupLabel(breakup) || "breakup";
    const valueStr = getBreakupPriceValue(breakup);

    // Validate breakup item decimal places
    if (config.validateDecimalPlaces) {
      try {
        assert.ok(valueStr !== undefined && hasTwoOrLessDecimalPlaces(valueStr),
          `Price value for '${label}' should not have more than 2 decimal places`
        );
        testResults.passed.push(
          `Decimal validation passed for breakup price - '${label}'`
        );
      } catch (error: any) {
        testResults.failed.push(error.message);
      }
    }

    // Calculate total breakup
    if (valueStr !== undefined) {
      totalBreakup += parseFloat(valueStr);
      totalBreakup = parseFloat(totalBreakup.toFixed(2));
    }

    // Check for tax presence
    if (getBreakupLabel(breakup) === "tax") {
      taxPresent = true;
    }
  });

  // Validate tax presence
  if (config.validateTaxPresence) {
    try {
      assert.ok(
        taxPresent,
        "Fulfillment charges will have a separate quote line item for taxes"
      );
      testResults.passed.push("Tax line item validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }

  // Validate quote total matches breakup total
  if (config.validateTotalMatch) {
    try {
      assert.ok(
        parseFloat(quote.price.value) === totalBreakup,
        `Quote price ${parseFloat(
          quote.price.value
        )} does not match the breakup total ${totalBreakup}`
      );
      testResults.passed.push("Quote price matches breakup total");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }

  // Validate COD breakup for COD flow
  if (config.validateCODBreakup && config.flowId === "CASH_ON_DELIVERY_FLOW") {
    const hasCODBreakup = quote.breakup.some(
      (b: QuoteBreakupItem) => getBreakupLabel(b) === "cod"
    );

    try {
      assert.ok(
        hasCODBreakup,
        `'cod' (along with its tax) charges are missing in quote.breakup`
      );
      testResults.passed.push("cod charges in quote breakup validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }
}

/**
 * Validates quote from order message
 */
export function validateOrderQuote(
  message: any,
  testResults: TestResult,
  config: QuoteValidationConfig = {}
): void {
  if (message?.order?.quote) {
    validateQuote(message.order.quote, testResults, config);
  }

  if (config.validateItemPriceConsistency && message?.order?.items && message?.order?.quote?.breakup) {
    const items: any[] = message.order.items || [];
    const breakup: QuoteBreakupItem[] = message.order.quote.breakup || [];

    // Build index from breakup by possible item id fields
    const breakupByItemId = new Map<string, QuoteBreakupItem>();
    for (const b of breakup) {
      const id = b["@ondc/org/item_id"] || b.item?.id;
      if (id) breakupByItemId.set(id, b);
    }

    for (const item of items) {
      const id: string | undefined = item?.id;
      if (!id) continue;
      const b = breakupByItemId.get(id);
      if (!b) {
        testResults.failed.push(`Breakup line for item '${id}' not found`);
        continue;
      }
      const itemPrice = item?.price?.value;
      const breakupPrice = b.price?.value ?? b.item?.price?.value;
      if (itemPrice !== undefined && breakupPrice !== undefined) {
        if (parseFloat(itemPrice) === parseFloat(breakupPrice)) {
          testResults.passed.push(`Item '${id}' price matches breakup`);
        } else {
          testResults.failed.push(`Item '${id}' price ${itemPrice} does not match breakup ${breakupPrice}`);
        }
      }
    }
  }
}
