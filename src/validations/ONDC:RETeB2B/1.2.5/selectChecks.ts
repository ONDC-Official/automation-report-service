import { TestResult } from "../../../types/payload";
import { failureGate, itemLabel, providerLabel, tagGroupsByCode, tagValue } from "./onSearchB2BChecks";
import { validateGpsFormat, ISO8601_DURATION } from "./commonChecks";

// Business checks for select / on_select, calibrated against real payloads from
// automation-specifications (Order_to_confirm_to_fulfillment__Prepaid_ and
// Out_of_Stock_Error_code_ flow configs) and cross-referenced against
// tools/workflow-orchestrator's select_validate.js / on_select_validate.js.
//
// IMPORTANT, confirmed against the real example payloads — do not "fix" these
// back without re-checking the payloads first:
//  - order.provider has NO descriptor in the select REQUEST (id + locations only).
//    select_validate.js demands provider.descriptor.{name,code,short_desc}, but
//    enforcing that literally fails the spec's own reference payload, so
//    descriptor is NOT required here. on_select's response DOES echo a
//    descriptor — that's a response-side convention, not a request one.
//  - item.quantity.count in select/on_select is a plain NUMBER (order
//    quantities), unlike on_search's catalog quantities, which are STRINGS.
//  - The out-of-stock signal lives at the callback's own `error` field
//    (jsonRequest.error), not the ACK/NACK envelope — confirmed by both
//    on_select_out_of_stock_validate.js and the real OOS example payload
//    (error.code "40002"), matching the doc's own error-code table.

const OUT_OF_STOCK_ERROR_CODE = "40002";

function reportDuplicates(ids: any[], label: string, result: TestResult): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (id === undefined || id === null) continue;
    const key = String(id);
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  for (const dupe of dupes) {
    result.failed.push(`select: duplicate ${label} '${dupe}'`);
  }
  return [...dupes];
}

// ---------------------------------------------------------------------------
// select (request)
// ---------------------------------------------------------------------------

export function validateSelectProvider(order: any, result: TestResult): void {
  if (!order?.provider?.id || !String(order.provider.id).trim()) {
    result.failed.push("select: order.provider.id is required");
    return;
  }
  result.passed.push(`select: order.provider.id '${order.provider.id}' is present`);
}

export function validateSelectItems(order: any, result: TestResult): void {
  const items = order?.items;
  if (!Array.isArray(items) || items.length === 0) {
    result.failed.push("select: order.items must be a non-empty array");
    return;
  }

  const cleanRun = failureGate(result);
  reportDuplicates(items.map((i: any) => i?.id), "item id", result);

  for (const item of items) {
    if (!item?.id || !String(item.id).trim()) {
      result.failed.push("select: an item is missing its id");
      continue;
    }
    const count = item?.quantity?.count;
    if (count === undefined || !Number.isInteger(count) || count <= 0) {
      result.failed.push(
        `${itemLabel(item)}: select: quantity.count '${count}' must be a positive integer (select quantities are numbers, not the catalog's quantity strings)`
      );
    }
  }

  if (cleanRun()) {
    result.passed.push(`select: all ${items.length} item(s) have a valid id and quantity.count`);
  }
}

/** Self-contained — item.location_id must resolve within THIS payload's own provider.locations, when both are given. */
export function validateSelectLocationRefs(order: any, result: TestResult): void {
  const locationIds = new Set((order?.provider?.locations || []).map((l: any) => l?.id).filter(Boolean));
  if (locationIds.size === 0) return;

  const cleanRun = failureGate(result);
  let referencing = 0;

  for (const item of order?.items || []) {
    if (item?.location_id === undefined || item?.location_id === null) continue;
    referencing++;
    if (!locationIds.has(item.location_id)) {
      result.failed.push(
        `select: ${itemLabel(item)} references location_id '${item.location_id}' which is not declared in order.provider.locations`
      );
    }
  }

  if (referencing > 0 && cleanRun()) {
    result.passed.push(`select: all ${referencing} item location_id reference(s) resolve to a declared location`);
  }
}

/** Self-contained — item.fulfillment_id must resolve within THIS payload's own order.fulfillments, when both are given. */
export function validateSelectFulfillmentRefs(order: any, result: TestResult): void {
  const fulfillmentIds = new Set((order?.fulfillments || []).map((f: any) => f?.id).filter(Boolean));
  if (fulfillmentIds.size === 0) return;

  const cleanRun = failureGate(result);
  let referencing = 0;

  for (const item of order?.items || []) {
    if (item?.fulfillment_id === undefined || item?.fulfillment_id === null) continue;
    referencing++;
    if (!fulfillmentIds.has(item.fulfillment_id)) {
      result.failed.push(
        `select: ${itemLabel(item)} references fulfillment_id '${item.fulfillment_id}' which is not declared in order.fulfillments`
      );
    }
  }

  if (referencing > 0 && cleanRun()) {
    result.passed.push(`select: all ${referencing} item fulfillment_id reference(s) resolve to a declared fulfillment`);
  }
}

/** The delivery-end GPS/address the buyer is selecting against. */
export function validateSelectFulfillmentLocation(order: any, result: TestResult): void {
  const fulfillments = order?.fulfillments;
  if (!Array.isArray(fulfillments) || fulfillments.length === 0) return;

  const cleanRun = failureGate(result);
  let checked = 0;

  for (const fulfillment of fulfillments) {
    const location = fulfillment?.end?.location;
    if (!location) continue;
    checked++;

    if (location.gps) {
      validateGpsFormat(location.gps, "select.fulfillment.end.location", result);
    }
    if (!location.address?.area_code || !String(location.address.area_code).trim()) {
      result.failed.push("select: fulfillment.end.location.address.area_code is required when a delivery location is given");
    }
  }

  if (checked > 0 && cleanRun()) {
    result.passed.push(`select: all ${checked} fulfillment delivery location(s) have valid gps/area_code`);
  }
}

/**
 * The B2B business-buyer identification attached to the fulfillment.
 * `fulfillment.customer` (with an `id`) is **required on both select and
 * on_select** — every fulfillment must name the retailer the order is for. All
 * four reference payloads carry it on every fulfillment.
 *
 * `organization.descriptor.name` is only required on the **request** side:
 * - select (both the plain and OOS examples) sends the full organization
 *   (`descriptor.name`, `address`, `city`, `state`).
 * - the success-case on_select echoes a *trimmed* organization — only
 *   `city.code`, no descriptor — while the OOS on_select echoes the full one.
 *   The two response examples disagree, so the seller echo is not held to it.
 *
 * Skips entirely when there is no `order` to inspect (e.g. a bare
 * `{context, error}` response), since there is then nowhere for a customer to live.
 */
export function validateCustomerIdentification(
  order: any,
  label: string,
  result: TestResult,
  opts: { requireOrganizationName?: boolean } = {}
): void {
  if (!order || typeof order !== "object") return;

  const cleanRun = failureGate(result);
  const fulfillments = order?.fulfillments;

  if (!Array.isArray(fulfillments) || fulfillments.length === 0) {
    result.failed.push(
      `${label}: order.fulfillments must be a non-empty array — fulfillment.customer is required to identify the business buyer`
    );
    return;
  }

  for (const fulfillment of fulfillments) {
    const fulfillmentRef = fulfillment?.id ? `fulfillment ${fulfillment.id}` : "fulfillment";
    const customer = fulfillment?.customer;

    if (!customer || typeof customer !== "object") {
      result.failed.push(`${label}: ${fulfillmentRef} is missing its required customer object`);
      continue;
    }
    if (!customer.id || !String(customer.id).trim()) {
      result.failed.push(`${label}: ${fulfillmentRef} customer.id is required`);
    }
    if (opts.requireOrganizationName && !customer.organization?.descriptor?.name) {
      result.failed.push(
        `${label}: ${fulfillmentRef} customer.organization.descriptor.name is required`
      );
    }
  }

  if (cleanRun()) {
    const detail = opts.requireOrganizationName ? "customer.id + organization name" : "customer.id";
    result.passed.push(
      `${label}: all ${fulfillments.length} fulfillment(s) identify the business buyer (${detail})`
    );
  }
}

/**
 * Cross-call: context.city must be the same in on_search and select — a buyer
 * cannot discover a catalog in one city and then order against it in another.
 * Skips silently when no on_search city was captured for this flow, which is the
 * normal case for the order flows that have no on_search step at all (only the
 * `_with_offers(...)` variants actually begin with search/on_search).
 */
export function validateCityConsistency(
  context: any,
  onSearchData: Record<string, any> | null,
  result: TestResult
): void {
  const onSearchCity = onSearchData?.city;
  const selectCity = context?.city;
  if (!onSearchCity || !selectCity) return;

  if (String(onSearchCity) !== String(selectCity)) {
    result.failed.push(
      `select: city code mismatch between on_search ('${onSearchCity}') and select ('${selectCity}')`
    );
    return;
  }

  result.passed.push(`select: context.city '${selectCity}' matches on_search`);
}

/**
 * Cross-call: the buyer's selected items, priced from the on_search catalog, must
 * meet the provider's order_value.min_value (advertised as a provider tag in
 * on_search — see onSearchB2BChecks.validateOrderValueTag). Skips silently when
 * either side of the comparison isn't available — this check only adds value
 * when it has real data to compare, never by penalizing missing cross-call state.
 */
export function validateMinimumOrderValue(order: any, onSearchData: Record<string, any> | null, result: TestResult): void {
  const stored = onSearchData?.providers;
  const providers: any[] = Array.isArray(stored) ? stored : stored ? [stored] : [];
  const provider = providers.find((p: any) => p?.id === order?.provider?.id);
  if (!provider) return;

  const minValueTag = tagGroupsByCode(provider.tags, "order_value")[0];
  const minValue = minValueTag ? parseFloat(tagValue(minValueTag.list, "min_value") ?? "") : NaN;
  if (Number.isNaN(minValue)) return;

  const catalogPriceById = new Map<string, number>();
  for (const item of provider.items || []) {
    const price = parseFloat(item?.price?.value ?? "");
    if (item?.id && !Number.isNaN(price)) catalogPriceById.set(item.id, price);
  }

  let total = 0;
  let priced = 0;
  for (const item of order?.items || []) {
    const price = catalogPriceById.get(item?.id);
    const count = item?.quantity?.count;
    if (price === undefined || !Number.isInteger(count)) continue;
    total += price * count;
    priced++;
  }
  if (priced === 0) return;

  if (total < minValue) {
    result.failed.push(
      `select: selected order value (${total.toFixed(2)}) is below ${providerLabel(provider)}'s order_value.min_value (${minValue})`
    );
  } else {
    result.passed.push(
      `select: selected order value (${total.toFixed(2)}) meets ${providerLabel(provider)}'s order_value.min_value (${minValue})`
    );
  }
}

// ---------------------------------------------------------------------------
// on_select (response)
// ---------------------------------------------------------------------------

/**
 * The out-of-stock / item-unavailable signal lives at the callback's own `error`
 * field (sibling of context/message), not the ACK/NACK envelope — confirmed
 * against on_select_out_of_stock_validate.js and the real OOS example payload.
 */
export function isOutOfStockResponse(jsonRequestError: any): boolean {
  return Boolean(jsonRequestError && Object.keys(jsonRequestError).length > 0);
}

export function validateOutOfStockError(error: any, result: TestResult): void {
  if (!error?.code) {
    result.failed.push("on_select: error response must include error.code");
    return;
  }
  if (error.code === OUT_OF_STOCK_ERROR_CODE) {
    result.passed.push(`on_select: error.code '${error.code}' is the expected out-of-stock code`);
  } else {
    // Don't hard-fail an error code we haven't confirmed — only 40002 (item
    // quantity unavailable) is documented for this leg, but the doc isn't
    // exhaustive, so an unrecognized code is reported, not rejected.
    result.passed.push(`on_select: error.code '${error.code}' present (not the documented out-of-stock code '${OUT_OF_STOCK_ERROR_CODE}', but not rejected)`);
  }
}

/**
 * The Out_of_Stock(Error_code) flow's FIRST on_select exists purely to prove the
 * seller rejects an unavailable quantity — so here the error is MANDATORY, and
 * the code must be the documented out-of-stock one. This is stricter than the
 * generic `validateOutOfStockError` above on purpose: elsewhere an error is an
 * optional terminal state, but in this certification flow its absence is the
 * defect. Mirrors on_select_out_of_stock_validate.js, which hard-fails with
 * "request must send the out of stock error" when `error` is missing.
 */
export function validateMandatoryOutOfStockError(error: any, result: TestResult): void {
  if (!isOutOfStockResponse(error)) {
    result.failed.push(
      `on_select: the first on_select of the Out_of_Stock(Error_code) flow must carry an out-of-stock error (expected error.code '${OUT_OF_STOCK_ERROR_CODE}') — none was sent`
    );
    return;
  }

  const cleanRun = failureGate(result);

  if (!error.code) {
    result.failed.push("on_select: out-of-stock error must include error.code");
  } else if (error.code !== OUT_OF_STOCK_ERROR_CODE) {
    result.failed.push(
      `on_select: out-of-stock error.code '${error.code}' must be '${OUT_OF_STOCK_ERROR_CODE}' (item quantity unavailable) for the Out_of_Stock(Error_code) flow`
    );
  }
  if (!error.type) {
    result.failed.push("on_select: out-of-stock error must include error.type");
  }

  if (cleanRun()) {
    result.passed.push(
      `on_select: mandatory out-of-stock error present (type '${error.type}', code '${error.code}')`
    );
  }
}

/** Ported from on_select_validate.js rule 1 — cross-call provider.id consistency. */
export function validateOnSelectProviderConsistency(order: any, selectData: Record<string, any> | null, result: TestResult): void {
  const selectedProviderId = selectData?.provider?.id;
  if (!selectedProviderId || !order?.provider?.id) return;

  if (order.provider.id !== selectedProviderId) {
    result.failed.push(
      `on_select: provider.id '${order.provider.id}' does not match provider.id '${selectedProviderId}' sent in select`
    );
  } else {
    result.passed.push(`on_select: provider.id '${order.provider.id}' matches select`);
  }
}

/**
 * Ported from on_select_validate.js rules 2-3 — every on_select item must have
 * been requested in select, and its location_id must match what select sent for
 * that item (or, if select didn't specify one, must be one of the provider
 * locations select declared).
 */
export function validateOnSelectItemsAgainstSelect(order: any, selectData: Record<string, any> | null, result: TestResult): void {
  const selectedItems: any[] = Array.isArray(selectData?.items) ? selectData.items : selectData?.items ? [selectData.items] : [];
  if (selectedItems.length === 0) return;

  const cleanRun = failureGate(result);
  const sentItemIds = new Set(selectedItems.map((i: any) => i?.id).filter(Boolean));
  const sentLocationByItemId = new Map<string, string>();
  for (const item of selectedItems) {
    if (item?.id && item?.location_id) sentLocationByItemId.set(item.id, item.location_id);
  }
  const sentLocationIds = new Set(
    (selectData?.provider?.locations || []).map((l: any) => l?.id).filter(Boolean)
  );

  let checked = 0;
  for (const item of order?.items || []) {
    if (!item?.id) continue;

    if (!sentItemIds.has(item.id)) {
      result.failed.push(`on_select: ${itemLabel(item)} was not requested in select`);
      continue;
    }
    checked++;

    if (item.location_id === undefined || item.location_id === null) continue;

    const expected = sentLocationByItemId.get(item.id);
    if (expected) {
      if (item.location_id !== expected) {
        result.failed.push(
          `on_select: ${itemLabel(item)} location_id '${item.location_id}' does not match location_id '${expected}' sent in select`
        );
      }
    } else if (sentLocationIds.size > 0 && !sentLocationIds.has(item.location_id)) {
      result.failed.push(
        `on_select: ${itemLabel(item)} location_id '${item.location_id}' is not one of the provider locations sent in select`
      );
    }
  }

  if (checked > 0 && cleanRun()) {
    result.passed.push(`on_select: all ${checked} item(s) were requested in select with consistent location_id`);
  }
}

/** Self-contained — on_select's own item.fulfillment_id must resolve within its own order.fulfillments. */
export function validateOnSelectFulfillmentRefs(order: any, result: TestResult): void {
  const fulfillmentIds = new Set((order?.fulfillments || []).map((f: any) => f?.id).filter(Boolean));
  if (fulfillmentIds.size === 0) return;

  const cleanRun = failureGate(result);
  let referencing = 0;

  for (const item of order?.items || []) {
    if (item?.fulfillment_id === undefined || item?.fulfillment_id === null) continue;
    referencing++;
    if (!fulfillmentIds.has(item.fulfillment_id)) {
      result.failed.push(
        `on_select: ${itemLabel(item)} references fulfillment_id '${item.fulfillment_id}' which is not declared in order.fulfillments`
      );
    }
  }

  if (referencing > 0 && cleanRun()) {
    result.passed.push(`on_select: all ${referencing} item fulfillment_id reference(s) resolve to a declared fulfillment`);
  }
}

/** fulfillment.state.descriptor.code and @ondc/org/TAT, when present. */
export function validateOnSelectFulfillmentDetails(order: any, result: TestResult): void {
  const fulfillments = order?.fulfillments;
  if (!Array.isArray(fulfillments) || fulfillments.length === 0) return;

  const cleanRun = failureGate(result);
  let checked = 0;

  for (const fulfillment of fulfillments) {
    const stateCode = fulfillment?.state?.descriptor?.code;
    if (stateCode !== undefined) {
      checked++;
      if (!String(stateCode).trim()) {
        result.failed.push(`on_select: fulfillment ${fulfillment?.id ?? "?"} state.descriptor.code must not be empty`);
      }
    }

    const tat = fulfillment?.["@ondc/org/TAT"];
    if (tat !== undefined) {
      checked++;
      if (!ISO8601_DURATION.test(String(tat))) {
        result.failed.push(`on_select: fulfillment ${fulfillment?.id ?? "?"} @ondc/org/TAT '${tat}' is not a valid ISO-8601 duration`);
      }
    }
  }

  if (checked > 0 && cleanRun()) {
    result.passed.push(`on_select: fulfillment state/@ondc/org/TAT valid across ${fulfillments.length} fulfillment(s)`);
  }
}
