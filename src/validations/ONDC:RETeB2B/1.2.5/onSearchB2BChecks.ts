import { TestResult } from "../../../types/payload";

// Business and cross-field checks for the broadcast on_search catalog.
// The cross-reference rules mirror automation-specifications'
// tools/workflow-orchestrator/output/dev/Discovery_flow_broadcast_search/scripts/on_search_validate.js
//
// Every check reports a `passed` entry when it actually verified something, so the
// report shows the full set of validations performed rather than only violations.
// A pass is only claimed when the check added no failures of its own — see `cleanRun`.

export const HHMM = /^([01]\d|2[0-3])[0-5]\d$/;

export function tagGroupsByCode(tags: any[] | undefined, code: string): any[] {
  return (tags || []).filter((tag: any) => tag?.code === code);
}

export function tagValue(list: any[] | undefined, code: string): string | undefined {
  return (list || []).find((entry: any) => entry?.code === code)?.value;
}

export function providerLabel(provider: any): string {
  return provider?.id ? `provider ${provider.id}` : "provider";
}

export function itemLabel(item: any): string {
  return item?.id ? `item ${item.id}` : "item";
}

// Returns a function that reports whether this check added any failures, so a
// check never claims a pass for the same thing it just flagged.
export function failureGate(result: TestResult): () => boolean {
  const before = result.failed.length;
  return () => result.failed.length === before;
}

export function validateOrderValueTag(provider: any, result: TestResult): void {
  const group = tagGroupsByCode(provider?.tags, "order_value")[0];
  if (!group) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} no order_value tag declared — nothing to validate`
    );
    return;
  }

  const minValue = tagValue(group.list, "min_value");
  const parsed = parseFloat(minValue ?? "");

  if (minValue === undefined || Number.isNaN(parsed) || parsed < 0) {
    result.failed.push(
      `on_search: ${providerLabel(provider)} order_value.min_value '${minValue}' is not a valid non-negative decimal`
    );
  } else {
    result.passed.push(
      `on_search: ${providerLabel(provider)} order_value.min_value '${minValue}' is valid`
    );
  }
}

export function validateTimingTags(provider: any, result: TestResult): void {
  const groups = tagGroupsByCode(provider?.tags, "timing");
  if (groups.length === 0) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} no timing tags declared — nothing to validate`
    );
    return;
  }

  const cleanRun = failureGate(result);

  for (const group of groups) {
    const type = tagValue(group.list, "type");
    if (type !== "Order" && type !== "Delivery") {
      result.failed.push(
        `on_search: ${providerLabel(provider)} timing.type '${type}' must be 'Order' or 'Delivery'`
      );
    }

    const rawDayFrom = tagValue(group.list, "day_from");
    const rawDayTo = tagValue(group.list, "day_to");
    const dayFrom = parseInt(rawDayFrom ?? "", 10);
    const dayTo = parseInt(rawDayTo ?? "", 10);

    if (
      Number.isNaN(dayFrom) ||
      Number.isNaN(dayTo) ||
      dayFrom < 1 ||
      dayFrom > 7 ||
      dayTo < 1 ||
      dayTo > 7 ||
      dayFrom > dayTo
    ) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} timing day range '${rawDayFrom}'-'${rawDayTo}' must be within 1-7 and ordered`
      );
    }

    const timeFrom = tagValue(group.list, "time_from") ?? "";
    const timeTo = tagValue(group.list, "time_to") ?? "";

    if (!HHMM.test(timeFrom) || !HHMM.test(timeTo) || timeFrom > timeTo) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} timing time range '${timeFrom}'-'${timeTo}' must be HHMM and ordered`
      );
    }
  }

  if (cleanRun()) {
    const types = groups.map((g) => tagValue(g.list, "type")).filter(Boolean);
    result.passed.push(
      `on_search: ${providerLabel(provider)} all ${groups.length} timing tag group(s) valid (${types.join(", ")})`
    );
  }
}

export function validateServiceabilityCategories(provider: any, result: TestResult): void {
  const groups = tagGroupsByCode(provider?.tags, "serviceability");
  if (groups.length === 0) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} no serviceability tags declared — nothing to validate`
    );
    return;
  }

  const cleanRun = failureGate(result);
  const itemCategoryIds = new Set(
    (provider?.items || []).map((item: any) => item?.category_id).filter(Boolean)
  );

  for (const group of groups) {
    const category = tagValue(group.list, "category");
    if (category && category !== "*" && !itemCategoryIds.has(category)) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} serviceability category '${category}' is not matching with items category`
      );
    }
  }

  if (cleanRun()) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} all ${groups.length} serviceability tag group(s) reference valid item categories`
    );
  }
}

export function validateBrandImagesConsistency(provider: any, result: TestResult): void {
  const cleanRun = failureGate(result);

  const itemBrands = new Set<string>();
  for (const item of provider?.items || []) {
    for (const group of tagGroupsByCode(item?.tags, "attribute")) {
      const brand = tagValue(group.list, "brand");
      if (brand) itemBrands.add(brand);
    }
  }

  const group = tagGroupsByCode(provider?.tags, "brand_images")[0];
  if (!group) {
    result.failed.push(
      `on_search: ${providerLabel(provider)} brand_images configuration is required`
    );
    return;
  }

  if (!Array.isArray(group.list) || group.list.length === 0) {
    result.failed.push(`on_search: ${providerLabel(provider)} brand_images list must not be empty`);
    return;
  }

  for (const entry of group.list) {
    if (typeof entry?.code !== "string" || !entry.code.trim()) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} invalid or missing code in brand_images`
      );
      continue;
    }
    if (typeof entry?.value !== "string" || !entry.value.trim()) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} invalid or missing value in brand_images for code '${entry.code}'`
      );
    }
    if (!itemBrands.has(entry.code)) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} brand image '${entry.code}' does not match with items brand attribute`
      );
    }
  }

  if (cleanRun()) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} brand_images present and all ${group.list.length} entry(ies) match item brand attributes`
    );
  }
}

export function validateRetailerInfoRequiredTags(provider: any, result: TestResult): void {
  const cleanRun = failureGate(result);
  const groups = tagGroupsByCode(provider?.tags, "retailer_info_required");

  if (groups.length === 0) {
    result.failed.push(
      `on_search: ${providerLabel(provider)} retailer_info_required configuration is required`
    );
    return;
  }

  for (const group of groups) {
    if (!Array.isArray(group.list) || group.list.length === 0) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} retailer_info_required list must not be empty`
      );
      continue;
    }
    for (const entry of group.list) {
      if (typeof entry?.code !== "string" || !entry.code.trim()) {
        result.failed.push(
          `on_search: ${providerLabel(provider)} invalid or missing code in retailer_info_required`
        );
      }
      if (typeof entry?.value !== "string" || !entry.value.trim()) {
        result.failed.push(
          `on_search: ${providerLabel(provider)} invalid or missing value in retailer_info_required for code '${entry?.code}'`
        );
      }
    }
  }

  if (cleanRun()) {
    const types = groups.map((g) => tagValue(g.list, "type")).filter(Boolean);
    const suffix = types.length ? ` (type: ${types.join(", ")})` : "";
    result.passed.push(
      `on_search: ${providerLabel(provider)} retailer_info_required present with ${groups.length} group(s)${suffix}`
    );
  }
}

export function validateVariantGroupConsistency(provider: any, result: TestResult): void {
  const cleanRun = failureGate(result);

  const variantGroupIds = new Set(
    (provider?.categories || [])
      .filter((category: any) =>
        tagGroupsByCode(category?.tags, "type").some(
          (group: any) => tagValue(group.list, "type") === "variant_group"
        )
      )
      .map((category: any) => category?.id)
      .filter(Boolean)
  );

  const itemsWithParent = (provider?.items || []).filter((item: any) => item?.parent_item_id);

  if (variantGroupIds.size === 0 && itemsWithParent.length === 0) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} no variant groups declared — nothing to validate`
    );
    return;
  }

  if (variantGroupIds.size > 0 && itemsWithParent.length === 0) {
    result.failed.push(
      `on_search: ${providerLabel(provider)} declares variant_group category(s) [${[...variantGroupIds].join(", ")}] but no item carries parent_item_id — the variant group is unusable`
    );
  }

  for (const item of itemsWithParent) {
    if (!variantGroupIds.has(item.parent_item_id)) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} ${itemLabel(item)} parent_item_id '${item.parent_item_id}' does not match any declared variant_group category`
      );
    }
  }

  if (cleanRun()) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} ${variantGroupIds.size} variant_group category(ies) [${[...variantGroupIds].join(", ")}] consistent with ${itemsWithParent.length} item(s) carrying parent_item_id`
    );
  }
}

export function validateFulfillmentReferences(
  provider: any,
  catalogFulfillments: any,
  result: TestResult
): void {
  const cleanRun = failureGate(result);

  const declared = new Set(
    [
      ...(provider?.fulfillments || []),
      ...(Array.isArray(catalogFulfillments) ? catalogFulfillments : []),
    ]
      .map((fulfillment: any) => fulfillment?.id)
      .filter((id: any) => id !== undefined && id !== null)
      .map(String)
  );

  let referencing = 0;
  for (const item of provider?.items || []) {
    const fulfillmentId = item?.fulfillment_id;
    if (fulfillmentId === undefined || fulfillmentId === null) continue;
    referencing++;

    if (!declared.has(String(fulfillmentId))) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} ${itemLabel(item)} references fulfillment_id '${fulfillmentId}' which is not declared in provider.fulfillments`
      );
    }
  }

  if (referencing === 0) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} no item fulfillment_id references — nothing to validate`
    );
    return;
  }

  if (cleanRun()) {
    result.passed.push(
      `on_search: ${providerLabel(provider)} all ${referencing} item fulfillment_id reference(s) resolve to declared fulfillments [${[...declared].join(", ")}]`
    );
  }
}

export function validateItemQuantityBounds(items: any[] | undefined, result: TestResult): void {
  if (!Array.isArray(items) || items.length === 0) return;

  const cleanRun = failureGate(result);
  let checked = 0;

  const parseCount = (raw: any): number | undefined => {
    if (raw === undefined || raw === null) return undefined;
    return /^\d+$/.test(String(raw)) ? parseInt(String(raw), 10) : NaN;
  };
  const usable = (value: number | undefined): value is number =>
    value !== undefined && !Number.isNaN(value);

  for (const item of items) {
    const quantity = item?.quantity;
    if (!quantity || typeof quantity !== "object") continue;
    checked++;

    const available = parseCount(quantity.available?.count);
    const maximum = parseCount(quantity.maximum?.count);
    const minimum = parseCount(quantity.minimum?.count);

    const labelled: Array<[string, number | undefined]> = [
      ["available", available],
      ["maximum", maximum],
      ["minimum", minimum],
    ];

    for (const [name, value] of labelled) {
      if (value !== undefined && Number.isNaN(value)) {
        result.failed.push(
          `on_search: ${itemLabel(item)} quantity.${name}.count must be a non-negative integer string`
        );
      }
    }

    if (usable(minimum) && usable(maximum) && minimum > maximum) {
      result.failed.push(
        `on_search: ${itemLabel(item)} quantity.minimum.count (${minimum}) exceeds quantity.maximum.count (${maximum})`
      );
    }

    // Deliberately no available-vs-maximum comparison: available.count is an ONDC
    // stock sentinel (99 = in stock, 0 = out of stock), not a real quantity, so
    // "99 > maximum" is normal and appears throughout the spec's own examples.
  }

  if (checked > 0 && cleanRun()) {
    result.passed.push(
      `on_search: quantity bounds valid for all ${checked} item(s) (MOQ within maximum)`
    );
  }
}

export function validatePackConfig(items: any[] | undefined, result: TestResult): void {
  if (!Array.isArray(items) || items.length === 0) return;

  const cleanRun = failureGate(result);
  let checked = 0;

  for (const item of items) {
    const group = tagGroupsByCode(item?.tags, "pack_config")[0];
    if (!group) continue;
    checked++;

    for (const entry of group.list || []) {
      const value = Number(entry?.value);
      if (!Number.isInteger(value) || value <= 0) {
        result.failed.push(
          `on_search: ${itemLabel(item)} pack_config.${entry?.code} value '${entry?.value}' must be a positive integer`
        );
      }
    }
  }

  if (checked === 0) {
    result.passed.push("on_search: no pack_config tags declared on items — nothing to validate");
    return;
  }

  if (cleanRun()) {
    result.passed.push(
      `on_search: pack_config bulk/selling-unit multiples valid for all ${checked} item(s)`
    );
  }
}

export function validateConsumerCareContact(items: any[] | undefined, result: TestResult): void {
  if (!Array.isArray(items) || items.length === 0) return;

  const cleanRun = failureGate(result);
  let checked = 0;

  for (const item of items) {
    const raw = item?.["@ondc/org/contact_details_consumer_care"];
    if (!raw) continue;
    checked++;

    const parts = String(raw).split(",");
    if (parts.length !== 3 || parts.some((part) => !part.trim())) {
      result.failed.push(
        `on_search: ${itemLabel(item)} contact_details_consumer_care must be 'name,email,phone'`
      );
      continue;
    }

    const [, email, phone] = parts;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      result.failed.push(
        `on_search: ${itemLabel(item)} contact_details_consumer_care email segment '${email.trim()}' is not a valid email`
      );
    }
    if (!/^\d{7,15}$/.test(phone.trim())) {
      result.failed.push(
        `on_search: ${itemLabel(item)} contact_details_consumer_care phone segment '${phone.trim()}' is not a valid phone number`
      );
    }
  }

  if (checked === 0) {
    result.passed.push(
      "on_search: no contact_details_consumer_care declared on items — nothing to validate"
    );
    return;
  }

  if (cleanRun()) {
    result.passed.push(
      `on_search: contact_details_consumer_care valid for all ${checked} item(s)`
    );
  }
}

export function validateProviderIdentity(provider: any, result: TestResult): void {
  const cleanRun = failureGate(result);

  const creds = provider?.creds || [];
  const gstin = creds.find((cred: any) => cred?.descriptor?.code === "GSTIN");

  if (gstin) {
    if (typeof gstin.id !== "string" || !gstin.id.trim()) {
      result.failed.push(
        `on_search: ${providerLabel(provider)} GSTIN credential is missing its id (the GSTIN number)`
      );
    }
  }

  if (cleanRun()) {
    result.passed.push(
      gstin
        ? `on_search: ${providerLabel(provider)} GSTIN credential present ('${gstin.id}')`
        : `on_search: ${providerLabel(provider)} no GSTIN credential declared — nothing to validate`
    );
  }
}

export function reportCatalogShape(catalog: any, result: TestResult): void {
  const providers = catalog?.["bpp/providers"];
  if (!Array.isArray(providers)) return;

  const itemCount = providers.reduce(
    (total: number, provider: any) => total + (provider?.items?.length || 0),
    0
  );
  const ids = providers.map((provider: any) => provider?.id).filter(Boolean);

  result.passed.push(
    `on_search: catalog contains ${providers.length} provider(s) [${ids.join(", ")}] with ${itemCount} item(s) total`
  );

  if (catalog?.["bpp/descriptor"]) {
    const npType = tagGroupsByCode(catalog["bpp/descriptor"]?.tags, "bpp_terms")
      .map((group: any) => tagValue(group.list, "np_type"))
      .find(Boolean);
    result.passed.push(
      npType
        ? `on_search: catalog bpp/descriptor present (np_type '${npType}')`
        : "on_search: catalog bpp/descriptor present"
    );
  }
}

// The P2P leg (on_search-1) carries only catalog['bpp/descriptor'] as an array of
// retailer_mapping tag groups. Per the eB2B development guide, retailer-specific
// scheme_progress/credit/poc tags must never appear in a broadcast-shaped response.
export function validateP2PDescriptor(descriptor: any, result: TestResult): void {
  // catalog['bpp/descriptor'] is optional on the P2P leg — a seller with nothing
  // retailer-specific to share for this customer_id may omit it entirely. When
  // absent, there's nothing to validate; only its shape is checked if present.
  if (descriptor === undefined || descriptor === null) {
    result.passed.push("on_search-1: catalog['bpp/descriptor'] not present — nothing to validate");
    return;
  }

  if (!Array.isArray(descriptor)) {
    result.failed.push("on_search-1: catalog['bpp/descriptor'], when present, must be an array");
    return;
  }

  if (descriptor.length === 0) {
    result.passed.push("on_search-1: catalog['bpp/descriptor'] is an empty array — nothing to validate");
    return;
  }

  const cleanRun = failureGate(result);
  const forbidden = new Set(["scheme_progress", "credit", "poc"]);

  for (const group of descriptor) {
    if (forbidden.has(group?.code)) {
      result.failed.push(
        `on_search-1: '${group.code}' must not appear in the P2P on_search response`
      );
      continue;
    }
    if (group?.code !== "retailer_mapping") {
      result.failed.push(
        `on_search-1: unexpected tag group code '${group?.code}', expected 'retailer_mapping'`
      );
      continue;
    }
    if (!Array.isArray(group.list) || group.list.length === 0) {
      result.failed.push("on_search-1: retailer_mapping list must not be empty");
      continue;
    }
    if (!tagValue(group.list, "customer_id")) {
      result.failed.push("on_search-1: retailer_mapping is missing customer_id");
    }
    if (!tagValue(group.list, "provider_id")) {
      result.failed.push("on_search-1: retailer_mapping is missing provider_id");
    }
  }

  if (cleanRun()) {
    const providerIds = descriptor
      .map((group: any) => tagValue(group?.list, "provider_id"))
      .filter(Boolean);
    result.passed.push(
      `on_search-1: all ${descriptor.length} retailer_mapping group(s) valid (provider_id: ${providerIds.join(", ")})`
    );
    result.passed.push(
      "on_search-1: no retailer-specific scheme_progress/credit/poc tags present, as required"
    );
  }
}
