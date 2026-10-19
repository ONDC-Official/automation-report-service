# ONDC:RETeB2B — `on_search` validations for `Discovery_flow_broadcast_search`

Reference for every check that runs against the **broadcast `on_search`** (the first
`on_search` leg) of the `Discovery_flow_broadcast_search` flow, domain `ONDC:RETeB2B`,
version `1.2.5`.

Companion document: [`RETeB2B-search-validations.md`](./RETeB2B-search-validations.md)
covers the two `search` request legs (`search-0` broadcast and `search-1` P2P) of the same
flow.

## Scope and gating

`OnSearch.ts` is shared by all nine RETeB2B flows, so the deep validation below is gated
twice — first on the flow, then on the step:

| `flowId` | `action_id` | Path taken |
|---|---|---|
| `Discovery_flow_broadcast_search` | `on_search` | **Deep broadcast validation** (everything in §3 and §3b) |
| `Discovery_flow_broadcast_search` | `on_search-1` | P2P descriptor checks only (§4) |
| `Discovery_flow_broadcast_search` | anything else | **Fails loudly** — `on_search: unexpected action_id '<id>' for flow '<flow>' — expected 'on_search' or 'on_search-1'` |
| any other RETeB2B flow | any | Light path: `bpp/providers` non-empty + per-item price sanity. No deep checks, no fail-loud. |

The `action_id` values come from the flow definition in
`automation-specifications` (`Discovery_flow_broadcast_search_deployment_config.json`,
`config/flows/eB2B/Discovery_flow_broadcast_search.yaml`), whose four steps are
`search-0` → `on_search` → `search-1` → `on_search-1`. The first `on_search` is the full
catalog broadcast; `on_search-1` is the retailer-specific P2P response and carries no
catalog.

**NACK short-circuit:** if `jsonRequest.error` is populated, catalog validation is skipped
and a pass is recorded (`on_search: NACK response — skipping catalog validation`) rather
than emitting a pile of missing-field failures.

### Source files

| File | Role |
|---|---|
| `src/validations/ONDC:RETeB2B/1.2.5/OnSearch.ts` | Entry point and gating |
| `src/validations/ONDC:RETeB2B/1.2.5/onSearchB2BChecks.ts` | eB2B-specific business/cross-field checks (§3, §4) |
| `src/validations/ONDC:RETeB2B/1.2.5/onSearchRetailChecks.ts` | Checks ported from log-validation-utility's retail validator (§3b) |
| `src/validations/ONDC:RETeB2B/1.2.5/commonChecks.ts` | `validateItemPricing` |

### At a glance

| Layer | Where | Count |
|---|---|---|
| Inherited pipeline checks | shared validators | §1 — 4 |
| Structural/type layer | — | §2 — **removed**, see below |
| eB2B-specific business checks | `onSearchB2BChecks.ts` | §3 — 12 functions |
| Ported retail checks | `onSearchRetailChecks.ts` | §3b — 19 functions |
| P2P leg | `onSearchB2BChecks.ts` | §4 — 1 function, 5 rules |

A clean two-provider broadcast payload produces **75 passed entries** and zero failures.
Rules deliberately left out — mostly B2C rules that would false-fail a compliant eB2B
catalog — are in §5.

---

## 1. Inherited checks (run for every payload, not specific to this flow)

These come from the shared pipeline, not from the broadcast-specific code:

- **Sync response envelope** (Joi `ackResponseSchema`, via `createDomainValidator`):
  `message.ack.status` must be `ACK` or `NACK`; when `NACK`, `error.code` and
  `error.message` are required; when `ACK`, `error` is forbidden. Unknown top-level keys
  (e.g. an echoed `context`) are permitted.
- **Transaction ID** (`validateTransactionId`): `context.transaction_id` must match one
  already recorded for this session + flow.
- **Flow continuity** (`checkPayload` → `flowContinuityValidators`): `message_id`
  uniqueness, timestamp monotonicity, and `bap_id`/`bap_uri`/`bpp_id`/`bpp_uri` stability
  across the flow.
- **API map bookkeeping** (`updateApiMap`): records the action; not an assertion.

---

## 2. Structural/type layer — removed

This section previously documented a JSON Schema (AJV) derived from the eB2B OpenAPI spec,
covering `context` `const` pins, required fields, value types, patterns, formats and four
conditional requirements. **It was deliberately removed**, along with the `ajv` and
`ajv-formats` dependencies, in favour of keeping this service dependency-free and
hand-written like every other domain here.

What that means in practice — these are no longer flagged:

| No longer detected | Previously caught by |
|---|---|
| `context.domain`/`action`/`core_version` not matching `ONDC:RETeB2B` / `on_search` / `1.2.5` | `const` pins |
| Missing `context` fields (e.g. `timestamp`, `bap_id`) | `required` block |
| Missing item fields (`price`, `descriptor`, `quantity`, `category_id`) | `required` block |
| `@ondc/org/returnable`/`cancellable`/`available_on_cod`/`seller_pickup_return` sent as strings instead of booleans | `type: boolean` |
| `quantity.*.count` sent as numbers instead of strings | `type: string` |
| Malformed `return_window`/`time_to_ship` durations, or a malformed `gps` | patterns |
| `returnable: true` without `return_window`; `F&B` without `time_to_ship`; the two statutory conditionals | `if`/`then` |
| `fulfillment.type` outside `Delivery`/`Pickup`/`Delivery and Pickup`; `provider.descriptor.code` outside `wholesaler`/`distributor`/`manufacturer` | enums |

One guard was kept as a plain assertion rather than a schema rule: the deep path still
fails when `catalog['bpp/providers']` is missing or empty, because without it the whole
catalog block returns silently and the report shows neither a pass nor a failure.

Everything in §3, §3b and §4 is unaffected — those are hand-written business and
cross-field checks that never depended on the schema.

---

## 3. eB2B-specific business and cross-field checks

All business checks (this section and §3b) run independently of one another, so one bad
field doesn't mask unrelated catalog defects. The five cross-reference rules below
mirror
`automation-specifications/tools/workflow-orchestrator/output/dev/Discovery_flow_broadcast_search/scripts/on_search_validate.js`.

### Pass reporting (applies to §3 and §3b alike)

Every check emits a `passed` entry when it actually verified something, so the report shows
the full set of validations performed rather than only the violations. A clean broadcast
payload with two providers produces **75 passed entries**.

Three rules govern this:

- **A check never claims a pass for something it just flagged.** Each function snapshots
  `result.failed.length` on entry (`failureGate`) and only emits its pass if it added no
  failures. A defect in provider P1 suppresses P1's pass for that check while leaving P2's
  pass intact.
- **Looping checks emit one aggregate pass with a count**, not one per entity — e.g.
  `all 4 timing tag group(s) valid (Order, Delivery, Order, Delivery)`. The count is what
  tells you the check actually examined data. (`validateItemPricing` is the exception: it
  pre-dates this work, is shared with `select.ts`, and keeps its per-item passes.)
- **Optional constructs that are absent report explicitly**, e.g.
  `no pack_config tags declared on items — nothing to validate`, so a check is never
  silently invisible. Mandatory constructs (`brand_images`, `retailer_info_required`) raise
  a failure when absent instead.

### Catalog level

| Function | Reports |
|---|---|
| `reportCatalogShape` | Provider count, provider ids, and total item count; plus whether `bpp/descriptor` is present and its `bpp_terms.np_type` value. Informational — raises no failures. |

### Provider level

| Function | Asserts | Example failure |
|---|---|---|
| `validateProviderIdentity` | When a `creds[]` entry has `descriptor.code == "GSTIN"`, its `id` (the GSTIN number) is a non-empty string. Reports the GSTIN when present, or notes its absence. | `provider P1 GSTIN credential is missing its id (the GSTIN number)` |
| `validateOrderValueTag` | `order_value` tag's `min_value` parses as a non-negative decimal | `provider P1 order_value.min_value '-5' is not a valid non-negative decimal` |
| `validateTimingTags` | For each `timing` group: `type` is `Order` or `Delivery`; `day_from`/`day_to` are 1–7 and ordered; `time_from`/`time_to` are `HHMM` (0000–2359) and ordered | `provider P1 timing time range '0000'-'2400' must be HHMM and ordered` |
| `validateServiceabilityCategories` | Each `serviceability` group's `category`, unless the `*` wildcard, matches a `category_id` present among that provider's items | `provider P1 serviceability category 'Nonexistent Category' is not matching with items category` |
| `validateBrandImagesConsistency` | `brand_images` tag group is **mandatory**; its list is non-empty; every entry has non-empty string `code` and `value`; **every `code` matches a brand declared in some item's `tags[code=attribute].list[code=brand]`** | `provider P1 brand image 'NotARealBrand' does not match with items brand attribute` |
| `validateRetailerInfoRequiredTags` | At least one `retailer_info_required` group is present (B2B buyer-KYC config); each group's list is non-empty; every entry has non-empty string `code` and `value` | `provider P1 retailer_info_required configuration is required` |
| `validateVariantGroupConsistency` | If any category declares `tags[code=type].list[code=type,value=variant_group]`, at least one item must carry `parent_item_id`; and every item's `parent_item_id` must resolve to a declared variant-group category id | `provider P1 item I1 parent_item_id 'V999' does not match any declared variant_group category` |
| `validateFulfillmentReferences` | Every item's `fulfillment_id` (singular) resolves against `provider.fulfillments[]` ∪ catalog-level `bpp/fulfillments[]` | `provider P1 item I1 references fulfillment_id 'F-NOPE' which is not declared in provider.fulfillments` |

### Item level

| Function | Asserts | Example failure |
|---|---|---|
| `validateItemPricing` | `price.value` parses as a non-negative number | `item I1 has invalid price.value '-5'` |
| `validateItemQuantityBounds` | `available`/`maximum`/`minimum` counts are non-negative integer strings; **`minimum` ≤ `maximum`** (MOQ sanity) | `item I1 quantity.minimum.count (500) exceeds quantity.maximum.count (100)` |
| `validatePackConfig` | Every value in the `pack_config` tag group (`unit`/`set`/`case` — the B2B bulk/selling-unit multiples) is a positive integer | `item I1 pack_config.unit value '0' must be a positive integer` |
| `validateConsumerCareContact` | `@ondc/org/contact_details_consumer_care` is exactly three non-empty comma-separated segments (`name,email,phone`); segment 2 is email-shaped; segment 3 is 7–15 digits | `item I1 contact_details_consumer_care email segment 'notanemail' is not a valid email` |

**Note on MOQ:** minimum order quantity is `quantity.minimum.count`, and bulk ordering
increments are the `pack_config` item tag. Both are validated above.

---

## 3b. Checks ported from the retail log-validation-utility

Ported from `log-validation-utility/utils/Retail_.1.2.5/Search/on_search.ts` and adapted
for eB2B (`onSearchRetailChecks.ts`). Each was calibrated against the real spec payload
first; the ones that would have false-failed it are listed in §5.

### Context

| Function | Asserts |
|---|---|
| `validateOnSearchContext` | `transaction_id` and `message_id` differ; `bap_id`/`bpp_id` are subscriber ids, not URLs; `ttl` is a valid ISO-8601 duration |

### Catalog

| Function | Asserts |
|---|---|
| `validateBppDescriptorTerms` | `bpp/descriptor` is present with a `bpp_terms` tag group carrying a non-empty `np_type`; `accept_bap_terms` must **not** be present; `collect_payment`, if present, is `Y` or `N` |
| `validateProviderUniqueness` | No duplicate `provider.id` across the catalog |

### Provider

| Function | Asserts |
|---|---|
| `validateProviderTimestamps` | `provider.time.timestamp` and every `item.time.timestamp` are not later than `context.timestamp` |
| `validateProviderEntityUniqueness` | No duplicate `location`/`category`/`item`/`fulfillment`/`offer` ids within a provider |
| `validateProviderLocations` | `location.time.days` entries are 1–7; `time.range` is HHMM and ordered; `schedule.holidays` are valid dates and not in the past. **Holidays compare date-only** — a holiday dated today is still upcoming even though its midnight timestamp precedes a mid-day `context.timestamp`. |
| `validateFulfillmentContacts` | `fulfillments[].contact.phone` is 10–11 digits; `contact.email` is email-shaped |
| `validateCategoryTags` | Category `type` tag is one of `custom_menu`/`custom_group`/`variant_group`; `attr` groups have a `name` and a numeric `seq`; `descriptor.images` is not an empty array |
| `validateServiceabilityConstructs` | Each construct has ≥5 entries, no duplicates, a `location` resolving to a declared provider location, and a `type` of `10`/`11`/`12`/`13` with matching `val`/`unit`: `10` → numeric val + `km`; `11` → 6-digit pincode list + `pincode`; `12` → `IND` + `country`; `13` → parseable GeoJSON + `geojson` |
| `validateServiceabilityCoverage` | Every unique item `category_id` is covered by a serviceability construct — short-circuited when a `*` wildcard construct is present |
| `validateOrderTimingPresence` | At least one `timing` construct of type `Order` is declared |

### Item

| Function | Asserts |
|---|---|
| `validateItemDescriptors` | `descriptor.short_desc`/`long_desc` non-empty; `descriptor.code` is `<type>:<code>` with type 1–5 (1-EAN, 2-ISBN, 3-GTIN, 4-HSN, 5-others) |
| `validateItemLocationRefs` | Every item `location_id` resolves to a declared provider location |
| `validateItemPriceBounds` | `price.value` ≤ `price.maximum_value` |
| `validateItemMaximumCount` | `quantity.maximum.count` is greater than 0 |
| `validateMandatoryItemTags` | Every item carries an `origin` tag (with a `country`) and an `attribute` tag; `veg_nonveg` codes are within `veg`/`non_veg`/`egg` |
| `validateReplacementTerms` | When present, `replacement_terms` is a non-empty array and each `replace_within.duration` is a valid ISO-8601 duration |
| `validateItemStatutoryFields` | When a statutory declaration is present, its always-applicable fields are non-empty — prepackaged food: `nutritional_info`, `additives_info`, `brand_owner_FSSAI_license_no`; packaged commodities: `manufacturer_or_packer_name`, `manufacturer_or_packer_address`, `common_or_generic_name_of_commodity`, `month_year_of_manufacture_packing_import`. Import-only fields (`importer_FSSAI_license_no`, `other_FSSAI_license_no`) stay optional — the spec's own example leaves them blank for domestic goods. |

### Offers (structural + cross-reference)

| Function | Asserts |
|---|---|
| `validateOffers` | `offers` is an array; each offer has an `id` and `descriptor.code`; `location_ids`/`item_ids` are non-empty and resolve to declared locations/items; any `category_ids` entries resolve to real item categories; `time.label` present and `time.range` start ≤ end; a `meta` tag with `additive`/`auto` ∈ `yes`/`no`; `benefit.value`/`value_cap` are negative (ONDC expresses discounts as negatives); `benefit.item_id` resolves to a declared item |

The per-offer-type qualifier/benefit matrix remains deferred — see §5 for why the B2C
version of it cannot be reused.

---

## 4. P2P leg (`on_search-1`)

`validateP2PDescriptor` checks `catalog["bpp/descriptor"]`:

- **`catalog['bpp/descriptor']` is optional** — a seller with nothing retailer-specific to
  share for this `customer_id` may omit it, or send an empty array. Either is a pass with
  nothing further to check. (Originally implemented as a hard requirement; corrected after
  a real session showed a valid P2P response with no `bpp/descriptor` at all.)
- When present and non-empty, it must be an **array** of tag groups (this leg carries no
  `bpp/providers`):
  - `scheme_progress`, `credit`, and `poc` codes **must not appear** — these are
    retailer-specific and belong elsewhere in the flow.
  - Every group's `code` must be `retailer_mapping`.
  - Each group's `list` must be non-empty and contain both `customer_id` and `provider_id`.

On success it emits one pass — either the "not present"/"empty array" note, or (when
populated) the group count with the mapped `provider_id`s plus an explicit confirmation
that no `scheme_progress`/`credit`/`poc` tags were present.

---

## 5. Deliberate non-checks

Documented so they don't get "fixed" back in by mistake:

| Not checked | Why |
|---|---|
| `available.count` ≤ `maximum.count` | `available.count` is an ONDC stock **sentinel** (`99` = in stock, `0` = out of stock), not a real quantity. The spec's own example payloads carry `available: "99"` with `maximum: "15"`, so this comparison would fail every compliant catalog. |
| Unknown/extra properties | Nothing rejects extra keys. This was a deliberate choice back when the schema existed (third-party seller apps routinely ship namespaced extension fields ahead of registry updates, so failing a compliant payload is worse than tolerating an unknown key), and it is now simply a consequence of there being no structural layer at all — see §2. |
| Item-level GST % / HSN codes | Not an `on_search` concern — no such field exists anywhere in the eB2B spec for this action. The only GST artifact here is the provider's GSTIN credential (`creds[].descriptor.code == "GSTIN"`). GST appears later as an `on_select`/`on_init` quote breakup line (`@ondc/org/title_type: "tax"`). |
| Credit limit / settlement terms | Belong to `on_init`/`confirm`/`on_confirm` (`credit` tag, `@ondc/org/settlement_details`), not to the catalog. |
| `retailer_info_required` values being exactly `"true"`/`"false"` | Left unenforced, matching the reference validator, which has this commented out. Note these are *string* booleans, unlike the item-level `@ondc/org/*` flags which are real JSON booleans. |
| `pack_config` ordering (`unit` ≤ `set` ≤ `case`) | Not documented as a hard rule anywhere; only positivity is enforced. |
| Deep per-offer-type qualifier/benefit matrix | The B2C version **cannot be reused**: it requires `qualifier.min_value` for `slab`, but eB2B's `slab` offers use `item_count`/`item_count_upper` or `item_weight`/`item_weight_upper`; it requires `benefit.item_value` for `freebie`, which eB2B omits; and it requires `qualifier.min_value` for `buyXgetY`, which eB2B omits. All four would false-fail the spec's own example. Structural + cross-reference offer checks are implemented (§3b); the per-type matrix needs authoring against the eB2B offers doc. |
| Strict 6-decimal GPS precision (`checkGpsPrecision`) | The retail validator requires exactly 6 decimal places; eB2B's reference payload uses 4 (`12.9675,77.7496`). The GPS format/range pattern is enforced instead. |
| Category `attr` tag name whitelist | The retail validator only allows `item.quantity.unitized.measure` or names starting with `item.tags.attribute`; eB2B's reference payload uses `item.tags.unitized.count` and `item.quantity.unitized.count`. Presence of `name` and a numeric `seq` is checked instead. |
| Per-type `descriptor.code` digit regexes | The retail validator keys an EAN/HSN/GTIN digit-format switch off the numeric suffix of the domain (`RET10` → `10`), which has no meaning for `RETeB2B`, and eB2B codes are alphanumeric (`1:COCACOLA2L6`). Only the generic `<type>:<code>` shape with type 1–5 is enforced. |
| `serviceability` count == item-category count | The retail validator requires these to be equal; eB2B's reference payload has 4 constructs against 3 unique item categories. Coverage is checked directionally instead (`validateServiceabilityCoverage`), with wildcard awareness. |
| `bap_id` must be a substring of `bap_uri` | A legitimate ONDC registry rule, but the reference payload uses placeholders (`sample-bap-id` vs `https://bap.example.com`) and would fail it. Withheld to keep the reference fixture clean — easy to enable if you want it for real traffic. |
| `unitized.measure.value` ≥ 1 | The retail validator rejects values below 1, which would wrongly reject sub-unit packs (e.g. a 0.5 kg pack). |
| Mandatory non-empty `provider.categories` | The retail validator requires it ("support for variants is mandatory"); a provider with no variant groups legitimately has none, and the eB2B OpenAPI does not require it. |
| STD-code vs `area_code` cross-check | Requires the retail validator's bundled India STD/pincode dataset (`AreacodeMap.json`), which is not available here. |
| Flow-code-gated checks (`FLOW001`, `FLOW004`, `FLOW012`, `FLOW016`, `FLOW017`, `FLOW01F`) | Keyed to B2C certification scenario codes with no eB2B equivalent. Several are also defective in the source (e.g. the `FLOW001` timing check fires when the tag is *present*). |
| Cross-call comparisons against `/search` | The retail validator compares `on_search`'s `message_id`/`transaction_id`/`domain` against values stashed from the preceding `/search` call. Not ported — would need a `search` save-spec; `context.domain`/`action`/`core_version` are pinned by the schema instead. |
| Strict date format on `location.time.schedule.holidays` | The OpenAPI spec declares `format: date`, but real traffic sends full date-time strings. `validateProviderLocations` parses them leniently instead and only checks they are valid dates and not in the past. |
| `on_search` error codes | No error codes apply to this action — `40002` (out of stock) is an `on_select` error, and the broadcast `on_search` is always ACK'd. |
| `X-ONDC-Search-Response` header (`full`/`p2p`/`inc`) | A documented business rule, but an HTTP header — not present in the captured payload, so not checkable here. |

---

## 6. Verification status

Validated against the **real spec-authored payloads** extracted from
`automation-specifications/Discovery_flow_broadcast_search_deployment_config.json`
(steps `on_search` and `on_search-1`).

- The unmutated broadcast payload validates **clean** — every business check, zero failures,
  **75 passed entries** across both providers.
- The P2P leg validates clean with 2 passed entries.
- Pass suppression confirmed: seeding a dangling `fulfillment_id` on provider P1 removes
  P1's fulfillment-reference pass, raises the failure, and leaves P2's pass intact.
- All four gating branches confirmed end to end: broadcast → deep validation (75 passes);
  `on_search-1` → P2P checks (2 passes); a wrong `action_id` → fail-loud; a different flow
  → light path untouched (16 passes).
- `npx tsc --noEmit` clean; `npm run build` ships all modules to `dist/`.

Every check below was proven by seeding its specific defect into the real payload and
confirming the expected failure appears. Note the schema-layer defects that used to be
listed here are no longer detected — see §2:

| Area | Seeded defects covered |
|---|---|
| Catalog presence | missing / empty `bpp/providers` |
| Context (§3b) | `transaction_id` == `message_id`; `bap_id` given as a URL; non-duration `ttl` |
| Catalog (§3, §3b) | `bpp_terms` without `np_type`; `accept_bap_terms` present; duplicate provider id |
| Provider (§3, §3b) | duplicate item id; provider timestamp after `context.timestamp`; item timestamp after `context.timestamp`; past holiday; 3-digit fulfillment phone; invalid category `type` tag; unmatched `brand_images` code; missing `brand_images`; missing `retailer_info_required`; GSTIN credential without an id; negative `order_value.min_value`; invalid `HHMM` timing; no `Order` timing construct |
| Serviceability (§3, §3b) | category matching no item; `location` not declared; unknown `type`; hyperlocal `unit` not `km`; unparseable GeoJSON; item category with no covering construct |
| Item (§3, §3b) | dangling `parent_item_id`; dangling `fulfillment_id`; dangling `location_id`; empty `short_desc`; malformed `descriptor.code`; MOQ > maximum; `maximum.count` of 0; `price.value` > `maximum_value`; missing `origin` tag; missing `attribute` tag; invalid `veg_nonveg` code; non-duration `replacement_terms`; empty statutory field; zero `pack_config` value; malformed consumer-care email |
| Offers (§3b) | unknown `item_ids`; unknown `location_ids`; `meta.additive` not yes/no; positive (non-negative) discount `value`; reversed `time.range`; missing `time.label`; `benefit.item_id` not a declared item |
| P2P (§4) | `credit` tag injected; empty descriptor array |

## 7. Related fixes made alongside

- **`validateProviderCatalogRefs` removed.** It cross-referenced item `category_id` (the
  flat ONDC taxonomy, e.g. `"Atta, Flours and Sooji"`) against `provider.categories[]` ids
  (variant groups, e.g. `V1`/`V2`) — two unrelated ID namespaces in eB2B, so it emitted a
  false failure on every real payload. Superseded by `validateServiceabilityCategories`,
  `validateVariantGroupConsistency`, and `validateFulfillmentReferences`. Its companion
  check also read `item.fulfillment_ids` (plural) when the real field is singular
  `fulfillment_id`, so it never fired.
- **`save-specs/RETeB2B/1.2.5/on_search.yaml` JSONPath corrected** from
  `$.message.catalog.providers[*]` to `$.message.catalog['bpp/providers'][*]`. The old path
  never matched, so select-vs-catalog cross-checks were silently no-oping.
- **`validateSelectAgainstCatalog` hardened** — `extractBySpec` unwraps a single-element
  JSONPath match to a bare object, so a one-provider catalog would previously have thrown
  on `.find()`.
