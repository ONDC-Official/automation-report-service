import assert from "assert";
import { TestResult } from "../../types/payload";
import { hasTwoOrLessDecimalPlaces } from "../../utils/constants";

/**
 * Interface for quote breakup items
 */
export interface QuoteBreakupItem {
  price: { value: string };
  "@ondc/org/title_type": string;
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
    // Validate breakup item decimal places
    if (config.validateDecimalPlaces) {
      try {
        assert.ok(
          hasTwoOrLessDecimalPlaces(breakup.price.value),
          `Price value for '${breakup["@ondc/org/title_type"]}' should not have more than 2 decimal places`
        );
        testResults.passed.push(
          `Decimal validation passed for breakup price - '${breakup["@ondc/org/title_type"]}'`
        );
      } catch (error: any) {
        testResults.failed.push(error.message);
      }
    }

    // Calculate total breakup
    totalBreakup += parseFloat(breakup.price.value);
    totalBreakup = parseFloat(totalBreakup.toFixed(2));

    // Check for tax presence
    if (breakup["@ondc/org/title_type"] === "tax") {
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
      (b: QuoteBreakupItem) => b["@ondc/org/title_type"] === "cod"
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
  if ("quote" in message.order && message.order.quote) {
    validateQuote(message.order.quote, testResults, config);
  }
}
