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
    if (b.title === 'NET_DISBURSED_AMOUNT') {
      return '0';
    }
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

export function validateGiftCardQuote(
  message: any,
  testResults: TestResult
): void {
  const quote = message?.order?.quote;
  const breakup = quote?.breakup || [];

  if (!quote || !breakup.length) {
    testResults.failed.push("Quote or breakup missing");
    return;
  }

  let computedTotal = 0;

  for (const line of breakup) {
    let raw = line?.price?.value;

    if (raw === undefined || raw === null) continue;

    // normalize value safely
    raw = String(raw)
      .replace("−", "-")     // unicode minus fix
      .replace(/\s+/g, "")   // remove whitespace

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      testResults.failed.push(`Invalid price value '${raw}'`);
      continue;
    }
    computedTotal += value;
  }

  const quoteTotal = Number(
    String(quote?.price?.value || "0").replace("−", "-").replace(/\s+/g, "")
  );

  if (Math.abs(computedTotal - quoteTotal) < 0.01) {
    testResults.passed.push("Quote total matches breakup sum");
  } else {
    testResults.failed.push(
      `Quote total mismatch. Expected ${computedTotal}, got ${quoteTotal}`
    );
  }
}

// ---------------------------------------------------------------------------
// FIS12 Personal Loan quote validation
// ---------------------------------------------------------------------------
const REQUIRED_LOAN_BREAKUP_TITLES = [
  "PRINCIPAL",
  "INTEREST",
  "PROCESSING_FEE",
  "OTHER_UPFRONT_CHARGES",
  "INSURANCE_CHARGES",
  "NET_DISBURSED_AMOUNT",
  "OTHER_CHARGES",
] as const;

function getLoanBreakupValue(breakup: any[], title: string): number {
  const item = breakup.find((b: any) => b?.title === title);
  if (!item) return 0;
  const raw = item?.price?.value ?? item?.item?.price?.value;
  const n = parseFloat(String(raw ?? "0"));
  return isNaN(n) ? 0 : n;
}

/**
 * Validates the quote on a FIS12 personal loan on_select / on_init / on_confirm.
 *
 * Rules:
 *  1. All required breakup titles must be present.
 *  2. quote.price.value == sum of all breakup EXCEPT NET_DISBURSED_AMOUNT.
 *  3. NET_DISBURSED_AMOUNT == PRINCIPAL - PROCESSING_FEE - OTHER_UPFRONT_CHARGES
 *                                       - INSURANCE_CHARGES - OTHER_CHARGES
 *
 * Per-field formula checks (e.g. INTEREST computation) to be added when formulas are confirmed.
 */
export function validateFIS12LoanQuote(
  message: any,
  testResults: TestResult
): void {
  const quote = message?.order?.quote;
  if (!quote) return;

  const breakup: any[] = quote?.breakup || [];
  const quoteTotal = parseFloat(quote?.price?.value ?? "0");

  // ── 1. Required breakup titles ─────────────────────────────────────────
  const presentTitles = new Set(breakup.map((b: any) => b?.title));
  for (const title of REQUIRED_LOAN_BREAKUP_TITLES) {
    if (presentTitles.has(title)) {
      testResults.passed.push(`Quote breakup contains required title: ${title}`);
    } else {
      testResults.failed.push(`Quote breakup is missing required title: ${title}`);
    }
  }

  // ── 2. quote.price.value == sum of all breakup EXCEPT NET_DISBURSED_AMOUNT ─
  let computedTotal = 0;
  for (const b of breakup) {
    if (b?.title === "NET_DISBURSED_AMOUNT") continue;
    const raw = b?.price?.value ?? b?.item?.price?.value;
    const val = parseFloat(String(raw ?? "0"));
    if (!isNaN(val)) computedTotal += val;
  }
  computedTotal = parseFloat(computedTotal.toFixed(2));

  if (Math.abs(quoteTotal - computedTotal) < 0.01) {
    testResults.passed.push(
      `Quote total (${quoteTotal}) matches sum of breakup items excluding NET_DISBURSED_AMOUNT (${computedTotal})`
    );
  } else {
    testResults.failed.push(
      `Quote total ${quoteTotal} does not match sum of breakup items (${computedTotal}). ` +
      `NET_DISBURSED_AMOUNT is excluded from the sum.`
    );
  }

  // ── 3. NET_DISBURSED_AMOUNT formula ────────────────────────────────────
  //   NET_DISBURSED_AMOUNT = PRINCIPAL - PROCESSING_FEE - OTHER_UPFRONT_CHARGES
  //                                    - INSURANCE_CHARGES - OTHER_CHARGES
  const principal = getLoanBreakupValue(breakup, "PRINCIPAL");
  const processingFee = getLoanBreakupValue(breakup, "PROCESSING_FEE");
  const otherUpfrontCharges = getLoanBreakupValue(breakup, "OTHER_UPFRONT_CHARGES");
  const insuranceCharges = getLoanBreakupValue(breakup, "INSURANCE_CHARGES");
  const otherCharges = getLoanBreakupValue(breakup, "OTHER_CHARGES");
  const netDisbursed = getLoanBreakupValue(breakup, "NET_DISBURSED_AMOUNT");
  const expectedNetDisbursed = parseFloat(
    (principal - processingFee - otherUpfrontCharges - insuranceCharges - otherCharges).toFixed(2)
  );

  if (Math.abs(netDisbursed - expectedNetDisbursed) < 0.01) {
    testResults.passed.push(
      `NET_DISBURSED_AMOUNT (${netDisbursed}) = PRINCIPAL(${principal}) - deductions(${processingFee + otherUpfrontCharges + insuranceCharges + otherCharges})`
    );
  } else {
    testResults.failed.push(
      `NET_DISBURSED_AMOUNT ${netDisbursed} does not match expected ${expectedNetDisbursed} ` +
      `[PRINCIPAL(${principal}) - PROCESSING_FEE(${processingFee}) - OTHER_UPFRONT_CHARGES(${otherUpfrontCharges}) ` +
      `- INSURANCE_CHARGES(${insuranceCharges}) - OTHER_CHARGES(${otherCharges})]`
    );
  }

  // ── TODO: Per-field formula checks ────────────────────────────────────
  // Add checks here once formulas are confirmed, e.g.:
  //   INTEREST = f(PRINCIPAL, INTEREST_RATE, TERM)
  //   PROCESSING_FEE = f(PRINCIPAL, ...)
}




