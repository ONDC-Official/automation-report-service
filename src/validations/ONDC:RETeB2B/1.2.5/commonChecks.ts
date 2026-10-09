import { TestResult } from "../../../types/payload";

/**
 * Common validation utilities for RETeB2B 1.2.5 flows.
 */

/**
 * ISO-8601 duration, as eB2B actually uses it. Accepts the date-part designators
 * (`P1D`, `P3M`) as well as the time part (`PT4H`, `PT30S`), and rejects a bare `P`
 * or a `T` with nothing after it.
 *
 * Deliberately broader than the B2C retail prior art's `^PT\d+[MH]$`: eB2B's
 * `@ondc/org/settlement_window` is `P1D` in every reference payload across all nine
 * order flows, which that narrower pattern would reject. Lives here rather than in
 * selectChecks.ts because both the select leg (`@ondc/org/TAT`) and the order-formation
 * leg (`@ondc/org/settlement_window`) need it.
 */
export const ISO8601_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/;

/**
 * Validate GPS coordinates format: "lat,lng"
 */
export function validateGpsFormat(gps: string | undefined, fieldPath: string, result: TestResult): void {
  if (!gps) return;
  const parts = gps.split(",");
  if (parts.length !== 2) {
    result.failed.push(`${fieldPath}: GPS must be in 'lat,lng' format, got '${gps}'`);
    return;
  }
  const [lat, lng] = parts.map(Number);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    result.failed.push(`${fieldPath}: GPS coordinates must be numeric, got '${gps}'`);
  } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    result.failed.push(`${fieldPath}: GPS coordinates out of range: lat=${lat}, lng=${lng}`);
  } else {
    result.passed.push(`${fieldPath}: GPS format is valid`);
  }
}

/**
 * Validate quote breakup: price.value must match sum(breakup[].price.value)
 */
export function validateQuoteBreakup(
  quote: any,
  result: TestResult,
  context: string = "quote"
): void {
  if (!quote?.breakup || !Array.isArray(quote.breakup)) {
    return;
  }

  const breakup = quote.breakup;

  if (quote?.price?.value) {
    const total = parseFloat(quote.price.value);
    const breakupSum = breakup.reduce((sum: number, b: any) => {
      const val = parseFloat(b?.price?.value || "0");
      return sum + (Number.isNaN(val) ? 0 : val);
    }, 0);

    if (!Number.isNaN(total) && Math.abs(total - breakupSum) > 0.01) {
      result.failed.push(
        `${context}: quote.price.value (${total}) does not match breakup sum (${breakupSum})`
      );
    } else if (!Number.isNaN(total)) {
      result.passed.push(`${context}: quote total matches breakup sum`);
    }
  }
}

/**
 * Validate per-item pricing (price.value is a non-negative number) and, when present,
 * that quantity.selected.count is > 0.
 */
export function validateItemPricing(
  items: any[] | undefined,
  result: TestResult,
  context: string = "items"
): void {
  if (!items || !Array.isArray(items)) return;

  for (const item of items) {
    const priceValue = item?.price?.value;
    if (priceValue !== undefined) {
      const price = parseFloat(String(priceValue));
      if (Number.isNaN(price) || price < 0) {
        result.failed.push(`${context}: item ${item?.id} has invalid price.value '${priceValue}'`);
      } else {
        result.passed.push(`${context}: item ${item?.id} price.value is valid`);
      }
    }

    const count = item?.quantity?.selected?.count;
    if (count !== undefined) {
      const parsedCount = parseInt(count, 10);
      if (Number.isNaN(parsedCount) || parsedCount <= 0) {
        result.failed.push(`${context}: item ${item?.id} quantity.selected.count must be > 0`);
      } else {
        result.passed.push(`${context}: item ${item?.id} quantity ${parsedCount} is valid`);
      }
    }
  }
}

/**
 * Validate order.state against a list of expected values. Note: ONDC retail
 * (unlike mobility/TRV domains) uses `order.state` with title-case values
 * ("Created", "Accepted", "In-progress", "Completed", "Cancelled") — not
 * `order.status`. Confirmed against log-validation-utility's retail 1.2.5
 * checkers (e.g. utils/Retail_.1.2.5/Confirm/onConfirm.ts, Cancel/onCancel.ts).
 */
export function validateOrderState(
  order: any,
  result: TestResult,
  expectedStates: string[],
  context: string = "order"
): void {
  if (!order?.state) return;

  if (expectedStates.includes(order.state)) {
    result.passed.push(`${context}: order.state '${order.state}' is valid`);
  } else {
    result.failed.push(
      `${context}: order.state '${order.state}' is unexpected, expected one of: ${expectedStates.join(", ")}`
    );
  }
}

/**
 * Validate fulfillment state codes — only flags states that are explicitly
 * recognized as valid; does not fail on unrecognized codes.
 */
export function validateFulfillmentState(
  fulfillments: any[] | undefined,
  result: TestResult,
  expectedStates: string[],
  context: string = "order"
): void {
  if (!fulfillments || !Array.isArray(fulfillments)) return;

  for (const f of fulfillments) {
    const stateCode = f?.state?.descriptor?.code;
    if (stateCode && expectedStates.length > 0 && expectedStates.includes(stateCode)) {
      result.passed.push(`${context}: fulfillment ${f.id} state '${stateCode}' is valid`);
    }
  }
}

/**
 * Compare an order id against the order id stored from the flow's CONFIRM call
 * (via the `confirm` save-spec). No-ops when no prior CONFIRM data is stored yet
 * (e.g. save-specs not configured, or this action legitimately precedes confirm).
 */
export function compareOrderIdContinuity(
  currentOrderId: string | undefined,
  storedOrderId: string | undefined,
  actionLabel: string,
  result: TestResult
): void {
  if (!storedOrderId) return;

  if (!currentOrderId) {
    result.failed.push(`${actionLabel}: order id missing, expected '${storedOrderId}' from CONFIRM`);
    return;
  }

  if (String(currentOrderId) === String(storedOrderId)) {
    result.passed.push(`${actionLabel}: order id matches CONFIRM`);
  } else {
    result.failed.push(
      `${actionLabel}: order id '${currentOrderId}' does not match CONFIRM order id '${storedOrderId}'`
    );
  }
}

/**
 * Cross-check a SELECT's chosen provider/items against the provider catalog
 * captured from ON_SEARCH (via the `on_search` save-spec). Written directly
 * against RETeB2B's multi-provider catalog shape (providers: array) rather than
 * reusing actionDataService's compareSelectVsOnSearch, which assumes a single
 * (non-array) provider shape and produces false positives against a retail catalog.
 */
export function validateSelectAgainstCatalog(
  message: any,
  onSearchData: Record<string, any> | null,
  result: TestResult
): void {
  // extractBySpec unwraps a single-element JSONPath match to a bare object, so a
  // one-provider catalog arrives here as an object rather than an array.
  const stored = onSearchData?.providers;
  const providers: any[] = Array.isArray(stored) ? stored : stored ? [stored] : [];
  if (providers.length === 0) return;

  const selectedProviderId = message?.order?.provider?.id;
  if (!selectedProviderId) return;

  const provider = providers.find((p: any) => p?.id === selectedProviderId);
  if (!provider) {
    result.failed.push(`select: provider '${selectedProviderId}' not found in ON_SEARCH catalog`);
    return;
  }
  result.passed.push("select: provider exists in ON_SEARCH catalog");

  const catalogItemIds = new Set((provider.items || []).map((it: any) => it?.id).filter(Boolean));
  const selectedItemIds: string[] = (message?.order?.items || [])
    .map((it: any) => it?.id)
    .filter(Boolean);
  const missingItems = selectedItemIds.filter((id: string) => !catalogItemIds.has(id));

  if (missingItems.length === 0) {
    result.passed.push("select: all selected items exist in ON_SEARCH catalog");
  } else {
    result.failed.push(`select: items not found in ON_SEARCH catalog: ${missingItems.join(", ")}`);
  }
}
