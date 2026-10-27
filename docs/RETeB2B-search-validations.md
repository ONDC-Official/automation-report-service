# ONDC:RETeB2B — `search` validations for `Discovery_flow_broadcast_search`

Reference for every check that runs against the two **`search`** legs of the
`Discovery_flow_broadcast_search` flow, domain `ONDC:RETeB2B`, version `1.2.5`.

Companion document: [`RETeB2B-on_search-broadcast-validations.md`](./RETeB2B-on_search-broadcast-validations.md)
covers the two `on_search` response legs of the same flow.

## Scope and gating

The flow's four steps are `search-0` → `on_search` → `search-1` → `on_search-1`. The two
search legs are **not** interchangeable:

| Leg | `action_id` | Purpose | Routing |
|---|---|---|---|
| Broadcast | `search-0` | Open discovery via the gateway | **No** `bpp_id`/`bpp_uri` |
| P2P | `search-1` | Retailer-specific follow-up to one seller | `bpp_id`/`bpp_uri` **required** |

`search.ts` is shared by all nine RETeB2B flows, so — exactly as in `OnSearch.ts` — the deep
path is gated on the flow first, then the step:

| `flowId` | `action_id` | Path taken |
|---|---|---|
| `Discovery_flow_broadcast_search` | `search-0` | Shared checks (§1) + broadcast-only checks (§2) |
| `Discovery_flow_broadcast_search` | `search-1` | Shared checks (§1) + P2P-only checks (§3) |
| `Discovery_flow_broadcast_search` | anything else | **Fails loudly** — `search: unexpected action_id '<id>' for flow '<flow>' — expected 'search-0' or 'search-1'` |
| any other RETeB2B flow | any | Light path: intent non-empty, finder-fee numeric, GPS format. No deep checks, no fail-loud. |

### Source files

| File | Role |
|---|---|
| `src/validations/ONDC:RETeB2B/1.2.5/search.ts` | Entry point and gating |
| `src/validations/ONDC:RETeB2B/1.2.5/searchChecks.ts` | Business checks (10 functions) |
| `src/validations/ONDC:RETeB2B/1.2.5/onSearchRetailChecks.ts` | `validateOnSearchContext`, reused for context hygiene |

Pass reporting follows the same three rules as the `on_search` doc: a check never claims a
pass for something it just flagged, loops report an aggregate with a count, and absent
optional constructs say so explicitly.

---

## 1. Shared checks (both legs)

### Structural/type layer — removed

A JSON Schema (AJV) derived from the eB2B OpenAPI spec used to run here, covering the
`context` `const` pins and required fields, `IntentPayment`'s required field pair and
`fee_type` enum, `intent.fulfillment.type`'s enum, the `gps` pattern, and a `code`-discriminated
tag union that enforced the `bap_terms` inner-code enum plus the 47-value `bap_features`
code enum with `value` fixed to `"yes"`.

**It was deliberately removed** along with the `ajv`/`ajv-formats` dependencies. No longer
detected as a result:

| No longer detected | Previously caught by |
|---|---|
| `context.domain`/`action`/`core_version` not matching `ONDC:RETeB2B` / `search` / `1.2.5` | `const` pins |
| Missing `context` fields (e.g. `timestamp`, `bap_id`, `city`) | `required` block |
| A `bap_features` code outside the OpenAPI's 47-value enum | enum |
| A `bap_terms` inner code outside `static_terms`/`static_terms_new`/`effective_date` (a *missing* required code is still caught by `validateBapTerms`) | enum |
| Malformed `gps` format (precision is still checked by `validateIntentFulfillment`) | pattern |
| Extra/unknown properties anywhere | — |

Several things the schema covered are still caught, because `searchChecks.ts` asserts them
independently: `intent` presence, the finder-fee type/amount pair, `fulfillment.type`'s
allowed values, and the three required `bap_terms` codes.

### Business checks

| Function | Asserts |
|---|---|
| `validateOnSearchContext` (reused) | `transaction_id` ≠ `message_id`; `bap_id`/`bpp_id` are subscriber ids, not URLs; `ttl` is a valid ISO-8601 duration |
| `validateSearchCity` | `context.city` is not the `*` wildcard (ported from `search-1_validate.js`) |
| `validateIntentPresence` | `message.intent` is present and non-empty; reports which keys it carries |

---

## 2. Broadcast leg only (`search-0`)

| Function | Asserts | Example failure |
|---|---|---|
| `validateBroadcastRouting` | `context` carries **neither** `bpp_id` nor `bpp_uri`. Per the eB2B guide: *"Broadcast search with a `bpp_id` in context is a defect — it silently becomes P2P."* | `search: broadcast search must not carry context.bpp_id ('sample-bpp-id') — it silently becomes a P2P search` |
| `validateBuyerFinderFee` | `intent.payment` present; `fee_type` ∈ `amount`/`percent`; `fee_amount` a non-negative decimal; and when the type is `percent`, the amount cannot exceed 100 | `search: buyer_app_finder_fee_amount '150' cannot exceed 100 when the type is 'percent'` |
| `validateBapTerms` | `bap_terms` group present with all three codes; `static_terms`/`static_terms_new` are http(s) URLs; `effective_date` parses and is **later than `context.timestamp`** | `search: bap_terms effective_date '2020-01-01...' must be later than context.timestamp` |
| `validateBapFeatures` | Every `bap_features` entry has a code and a `value` of `"yes"` — features are advertised by presence, never disclaimed with `"no"` | `search: bap_features '01A' value 'no' must be 'yes' — features are advertised by presence` |
| `validateItemCategoryExclusivity` | `intent` does not declare both `item` and `category`; reports which scope was chosen | `search: message.intent cannot declare both 'item' and 'category' — pick one search scope` |
| `validateIntentFulfillment` | `fulfillment.type` is valid; if `fulfillment.end` is given, `location.gps` is required and must carry **at least 4** decimal places | `search: intent.fulfillment.end.location.gps '12.96,77.74' must give at least 4 decimal places of precision` |

**Deviation worth knowing:** log-validation-utility's `validateTermsList` compares
`effective_date` against wall-clock `new Date()`. That makes the same captured payload pass
today and fail tomorrow, which is wrong for a reproducible certification report, so we
compare against `context.timestamp` instead.

**GPS precision note:** retail's `search.ts` asks for "at least 4 decimal places" while its
`on_search.ts` counterpart demands exactly 6. eB2B payloads use 4, so the looser search-side
rule is the one adopted here — and the strict 6-decimal rule is *not* applied on the
`on_search` side either (see that doc's §5).

---

## 3. P2P leg only (`search-1`)

| Function | Asserts | Example failure |
|---|---|---|
| `validateP2PRouting` | **Both** `context.bpp_id` and `context.bpp_uri` are present — a P2P search targets exactly one seller | `search-1: context.bpp_id is required for a P2P search` |
| `validateP2PRetailerIdentification` | The retailer is identified by **either** `intent.fulfillment.customer` **or** at least one `retailer_mapping` tag group; each group must carry at least one of `customer_id`, `phone_number`, `PAN` | `search-1: P2P search must identify the retailer via intent.fulfillment.customer or a retailer_mapping tag group` |

**Source conflict resolved here:** `automation-specifications`' own
`search-1_validate.js` requires `intent.fulfillment.customer`, but the spec's own `search-1`
example payload has no `fulfillment` at all — it identifies the retailer through
`retailer_mapping` tags (`customer_id`, or `phone_number`+`PAN` for a retailer the seller
hasn't onboarded yet, mirroring the `retailer_info_required` config the seller advertises in
`on_search`). Enforcing the script literally would fail the reference payload, so **either
mechanism is accepted**.

---

## 4. Deliberate non-checks

| Not checked | Why |
|---|---|
| Unknown/extra properties | Nothing rejects extra keys; a consequence of there being no structural layer (see §1). |
| `effective_date` vs wall clock | Replaced with a comparison against `context.timestamp` so reports are reproducible (see §2). |
| Cross-leg comparison of `search-0` vs `search-1` | The two legs share a `transaction_id` and differ in `message_id`, which would be worth asserting, but it needs a `search` save-spec plus Redis and could not be verified in this environment. Noted as a follow-up; the within-payload `transaction_id` ≠ `message_id` rule is already covered. |
| `bnp_demand_signal` / `bap_promos` tag rules | Gated behind B2C certification flow codes (`FLOW025`, `FLOW022`) with no eB2B equivalent. |
| `bap_id` ⊂ `bap_uri` | A real ONDC registry rule, but the reference payloads use placeholders (`sample-bap-id` vs `https://bap.example.com`) and would fail it. Withheld for the same reason as on the `on_search` side. |

---

## 5. Verification status

Validated against the **real spec-authored payloads** extracted from
`automation-specifications/Discovery_flow_broadcast_search_deployment_config.json`
(steps `search-0` and `search-1`).

Both real payloads validate **clean**:

- `search-0` → **9 passed, 0 failed**: context ids/ttl; specific city; intent keys;
  broadcast correctly omits bpp routing; finder fee `3.54` (percent); `bap_terms` with a
  future `effective_date`; `bap_features` advertising `[01A, 0091]`; category-scoped intent;
  valid `Delivery` fulfillment.
- `search-1` → **5 passed, 0 failed**: context ids/ttl; specific city; intent keys;
  P2P targeting `sample-bpp-id`; retailer identified via 3 `retailer_mapping` groups.

All four gating branches confirmed: `search-0` → broadcast checks; `search-1` → P2P checks;
a wrong `action_id` → fail-loud; a different flow → light path.

Seeded-defect coverage — each check proven by injecting its specific defect:

| Area | Seeded defects covered |
|---|---|
| Context | missing `intent`; `transaction_id` == `message_id`; non-duration `ttl`; `city` = `*` |
| Broadcast routing | `bpp_id` present; `bpp_uri` present |
| Finder fee | `payment` missing; `fee_type` = `flat`; non-numeric amount; percent amount > 100 |
| Intent scope | both `item` and `category` declared |
| Fulfillment | invalid `type`; `end` without `gps`; GPS with only 2 decimals |
| `bap_terms` | group missing; `effective_date` missing; `static_terms` not a URL; `effective_date` in the past |
| `bap_features` | `value` = `no` (the code enum is no longer checked — see §1) |
| P2P | `bpp_id` missing; `bpp_uri` missing; no retailer identification at all; `retailer_mapping` carrying none of `customer_id`/`phone_number`/`PAN` |

`npx tsc --noEmit` clean; `npm run build` ships `searchChecks.js` to `dist/`. The `on_search` suite was re-run afterwards and is unchanged (75 / 2 passes), since
both actions share `validateOnSearchContext`.
