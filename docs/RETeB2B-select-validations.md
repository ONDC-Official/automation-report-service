# ONDC:RETeB2B — `select` / `on_select` validations

Reference for the checks that run against `select` and `on_select` across the RETeB2B order
flows (`Order_to_confirm_to_fulfillment_(Prepaid)`, `_(cod)`, both `_with_offers(...)`
variants, `Buyer_Side_Order_Cancellation`, `Merchant_Side_RTO_and_Part_Order_Cancellation_Flow`,
`Buyer_Initiated_Return_(...)`, and `Out_of_Stock(Error_code)`), domain `ONDC:RETeB2B`,
version `1.2.5`.

Most of these checks apply uniformly wherever `select`/`on_select` appears — the
out-of-stock branch is normally detected from the payload's own content (an `error` field)
rather than from knowing which flow is running.

**The one exception is `Out_of_Stock(Error_code)`**, whose two `on_select` legs are
disambiguated by `action_id` and have different contracts (see §2a):

| Leg | `action_id` | Contract |
|---|---|---|
| Rejection | `on_select_out_of_stock` | Out-of-stock error is **mandatory** |
| Retry | `on_select` | Expected to succeed; normal checks apply |

Everywhere else, an `error` on `on_select` is an optional terminal state.

### Source files

| File | Role |
|---|---|
| `src/validations/ONDC:RETeB2B/1.2.5/select.ts` | Entry point for the request |
| `src/validations/ONDC:RETeB2B/1.2.5/OnSelect.ts` | Entry point for the response |
| `src/validations/ONDC:RETeB2B/1.2.5/selectChecks.ts` | All business/cross-field checks (13 functions) |
| `src/validations/ONDC:RETeB2B/1.2.5/commonChecks.ts` | `validateItemPricing`, `validateQuoteBreakup`, `validateSelectAgainstCatalog` |
| `src/config/save-specs/RETeB2B/1.2.5/select.yaml` | New — persists `provider` + `items` so `on_select` can cross-check against what was actually selected |
| `src/config/save-specs/RETeB2B/1.2.5/on_search.yaml` | Extended with `city: "$.context.city"` so `select` can compare it |

Pass reporting follows the same rules as the `on_search`/`search` docs: a check never claims
a pass for something it just flagged, loops report an aggregate with a count, and absent
optional constructs say so explicitly (`cleanRun`/`failureGate`, reused from
`onSearchB2BChecks.ts`).

---

## Research sources and a real bug this caught

Calibrated against the real example payloads in `automation-specifications`'
`config/flows/eB2B/Order_to_confirm_to_fulfillment__Prepaid_.yaml` (the plain success case)
and `Out_of_Stock_Error_code_.yaml` (the OOS case, which has **two** select/on_select pairs:
`select0`/`on_select_out_of_stock` for the rejected first attempt, then `select`/`on_select`
for the retry) — plus the matching `tools/workflow-orchestrator/.../scripts/select_validate.js`
and `on_select_validate.js`.

**Bug found and fixed:** the previous `OnSelect.ts` detected out-of-stock by checking
`jsonResponse.response.message.ack.status === "NACK"`. The real OOS example payload proves
this is wrong — the out-of-stock signal lives at the callback's own `error` field
(`jsonRequest.error`, sibling of `context`/`message`), exactly like `on_search`'s NACK
short-circuit already does it. The ACK/NACK envelope under `jsonResponse` is a *different*
thing — it's the synchronous reply to receiving the callback itself, already validated
generically by the shared Joi schema. The real OOS payload confirms the fix: it carries
`error: {type: "DOMAIN-ERROR", code: "40002", message: "..."}` at the top level, while
`message.order` is still a fully-formed (if zeroed-out) order. The old code was checking a
field that, for this leg, is essentially always `"ACK"` — meaning **the OOS branch never
actually fired**, and every out-of-stock response was being run through the normal
quote/structure checks instead.

**Error code now pinned:** the TODO against guessing the out-of-stock error code is
resolved — the real payload confirms `"40002"`, matching the doc's own error-code table
(*"Item quantity unavailable (out of stock) — sent by BPP — appears in on_select.error"*).
An error with a different code is still accepted (reported, not rejected), since no other
code is documented for this leg and the doc isn't exhaustive.

**Descriptor requirement NOT ported:** `select_validate.js` (both the plain flow's and the
OOS flow's `select0_validate.js`) requires `order.provider.descriptor.{name,code,short_desc}`.
The plain flow's own real `select` example payload has `order.provider` with only `id` and
`locations` — **no `descriptor` at all** — so enforcing the script literally would fail the
reference payload. (The OOS flow's `select0` example, confusingly, *does* include a
descriptor — the two reference payloads disagree with each other, which only reinforces that
this isn't a hard requirement.) `descriptor` is not validated on the request side.

---

## 1. `select` (request)

| Function | Asserts | Example failure |
|---|---|---|
| `validateItemPricing` (shared) | `price.value`, when present, is a non-negative number | — |
| `validateSelectProvider` | `order.provider.id` is present | `select: order.provider.id is required` |
| `validateSelectItems` | `order.items` is non-empty; no duplicate item ids; each item has an `id` and a `quantity.count` that is a **positive integer** — select/on_select quantities are plain numbers, unlike `on_search`'s catalog quantities which are strings | `item I1: select: quantity.count '8' must be a positive integer (select quantities are numbers, not the catalog's quantity strings)` |
| `validateSelectLocationRefs` | Self-contained: each item's `location_id`, when present, resolves to one of `order.provider.locations` declared in this same payload | `select: item I1 references location_id 'L99' which is not declared in order.provider.locations` |
| `validateSelectFulfillmentRefs` | Self-contained: each item's `fulfillment_id`, when present, resolves to one of `order.fulfillments` declared in this same payload. **No-ops when fulfillments don't declare an `id`** — confirmed, the real `select` payloads never assign fulfillment ids (the seller assigns them in `on_select`), so there's nothing to cross-reference at this stage. | `select: item I1 references fulfillment_id 'F-NOPE' which is not declared in order.fulfillments` |
| `validateSelectFulfillmentLocation` | For each fulfillment with an `end.location`: `gps`, if present, matches the standard lat,lng pattern; `address.area_code` is required | `select: fulfillment.end.location.address.area_code is required when a delivery location is given` |
| `validateCustomerIdentification` | The B2B buyer identification — **required**: `order.fulfillments` must be non-empty, and every fulfillment must carry a `customer` with a non-empty `id`. On the request side `customer.organization.descriptor.name` is also required (see §2b for why the response side isn't held to it). | `select: fulfillment customer.organization.descriptor.name is required` |
| `validateCityConsistency` | Cross-call: `context.city` matches the city captured from `on_search`. Skips silently when no `on_search` city was stored for the flow. | `select: city code mismatch between on_search ('std:080') and select ('std:060')` |
| `validateSelectAgainstCatalog` (shared, pre-existing) | Cross-call: selected provider and items exist in the `on_search` catalog | `select: provider 'P9' not found in ON_SEARCH catalog` |
| `validateMinimumOrderValue` | Cross-call: `Σ(catalog price × selected quantity)` meets the provider's `order_value.min_value` tag advertised in `on_search` (see the `on_search` doc §3b). Skips silently when either side of the comparison isn't available — it only adds value when it has real data to compare. | `select: selected order value (416.00) is below provider P1's order_value.min_value (500.00)` |

---

## 2. `on_select` (response)

### Out-of-stock branch (generic)

For any flow other than `Out_of_Stock(Error_code)`, when `jsonRequest.error` is populated
`validateOutOfStockError` runs instead of the normal checks below — see the bug-fix note
above. It requires `error.code` to be present, and reports (without failing) whether it's
the documented `"40002"`. An error here is treated as an **optional** terminal state.

## 2a. `Out_of_Stock(Error_code)` — the error is mandatory on the first `on_select`

The whole point of this certification flow is to prove the seller rejects an unavailable
quantity, so on the rejection leg (`action_id: "on_select_out_of_stock"`) the error is
**mandatory**, not optional. `validateMandatoryOutOfStockError` requires:

| Requirement | Failure |
|---|---|
| `error` present and non-empty | `on_select: the first on_select of the Out_of_Stock(Error_code) flow must carry an out-of-stock error (expected error.code '40002') — none was sent` |
| `error.code` === `"40002"` | `on_select: out-of-stock error.code '30012' must be '40002' (item quantity unavailable) for the Out_of_Stock(Error_code) flow` |
| `error.type` present | `on_select: out-of-stock error must include error.type` |

This mirrors `on_select_out_of_stock_validate.js`, which hard-fails with *"request must send
the out of stock error"* when `error` is absent. Note this leg is **stricter about the code
than the generic branch**: elsewhere an unrecognized code is reported but not rejected,
whereas this flow is explicitly named for the error code, so `40002` is required.

The retry leg (`action_id: "on_select"`) falls through to the normal checks in §2 — it is
expected to succeed, since `init`/`on_init`/`confirm` follow it in the flow.

An `action_id` on this flow that is neither value **fails loudly**
(`on_select: unexpected action_id '<id>' for flow 'Out_of_Stock(Error_code)' — expected
'on_select_out_of_stock' (rejection) or 'on_select' (retry)`), consistent with the
`search`/`on_search` gating decision.

### Normal branch

| Function | Asserts | Example failure |
|---|---|---|
| `validateQuoteBreakup` (shared) | `quote.price.value` equals the sum of `quote.breakup[].price.value` | — |
| `validateOnSelectFulfillmentRefs` | Self-contained: each item's `fulfillment_id` resolves within **this payload's own** `order.fulfillments` (on_select, unlike select, does assign fulfillment ids) | `on_select: item I1 references fulfillment_id 'F-GHOST' which is not declared in order.fulfillments` |
| `validateOnSelectFulfillmentDetails` | `fulfillment.state.descriptor.code`, when present, is non-empty; `@ondc/org/TAT`, when present, is a valid ISO-8601 duration (confirmed this field belongs specifically to `on_select`, not `on_search`) | `on_select: fulfillment F1 @ondc/org/TAT '4 hours' is not a valid ISO-8601 duration` |
| `validateOnSelectProviderConsistency` | Cross-call (ported from `on_select_validate.js`): `order.provider.id` matches the `provider.id` sent in `select` | `on_select: provider.id 'P9' does not match provider.id 'P1' sent in select` |
| `validateOnSelectItemsAgainstSelect` | Cross-call (ported from `on_select_validate.js`): every item was requested in `select`; each item's `location_id` matches what `select` sent for that item id, or — if `select` didn't specify one — is one of the provider's locations `select` declared | `on_select: item I1 location_id 'L2' does not match location_id 'L1' sent in select` |
| `validateCustomerIdentification` | Same requirement as on the request side: `order.fulfillments` non-empty, every fulfillment carries a `customer` with a non-empty `id` — but **not** `organization.descriptor.name` (see §2b) | `on_select: fulfillment F1 is missing its required customer object` |

### 2b. Why `organization.descriptor.name` is request-side only

`fulfillment.customer` and `customer.id` are required on **both** actions. The nested
`organization.descriptor.name` is required only on `select`, because the two `on_select`
reference payloads disagree with each other:

| Payload | `customer.organization` contains |
|---|---|
| `select` (both plain and OOS) | `descriptor.name`, `address`, `city`, `state` |
| `on_select` — OOS rejection | `descriptor.name`, `address`, `city`, `state` |
| `on_select` — success case | **only** `city.code` |

The seller's echo is legitimately trimmed in the success case, so holding the response to
`descriptor.name` would false-fail the spec's own payload. The buyer's `select` always sends
the full organization, so that side is held to it.

---

## 3. Deliberate non-checks

| Not checked | Why |
|---|---|
| `order.provider.descriptor` on the request side | Not required by the real `select` example payload (see the bug/finding section above) — enforcing the orchestrator script's requirement would fail it. |
| Selected `quantity.count` must equal `on_select`'s echoed `quantity.count` | The Prepaid flow's own reference payloads disagree with each other on this (select sends `8`, the matching on_select echoes `1` for the same transaction) — almost certainly sloppy example authoring rather than a real protocol rule, so no equality check is enforced. |
| `item.quantity.available`/`maximum` bounds at select/on_select time | Those are catalog-time (`on_search`) concepts with string counts; order-time quantities here are plain numbers with a different meaning (how many units the buyer is ordering), so the `on_search` bounds checks don't apply. |
| Disabled-provider/disabled-item checks, customization/`parent_item_id` consistency, flow-code-gated rules (`FLOW016` custom groups, `FLOW025` `bnp_demand_signal`) | B2C retail concepts from `log-validation-utility`'s `select.ts`/`onSelect.ts` with no confirmed eB2B equivalent — not ported. |
| GPS 6-decimal precision | Same reasoning as `on_search`/`search` — eB2B payloads use fewer decimals; only the pattern/range is enforced. |

---

## 4. Verification status

Validated against the **real spec-authored payloads** from both
`Order_to_confirm_to_fulfillment__Prepaid_.yaml` (success case) and
`Out_of_Stock_Error_code_.yaml` (`select0`/`on_select_out_of_stock`, the OOS case): **27
assertions, all passing.**

- The real success-case `select` validates clean (6 passed, 0 failed) and `on_select`
  validates clean (3 passed, 0 failed).
- The real OOS-case `select0` validates clean, and — critically — `on_select_out_of_stock`
  now validates clean too, with the `40002` error code correctly recognized. Before the fix,
  this leg was silently skipping the OOS branch entirely.
- **Mandatory-error rule (§2a): 12/12 assertions.** The real rejection payload still passes;
  omitting `error` entirely now fails (the previously-missed case), as do an empty `error`
  object, a wrong code (`30012`), and a missing `error.type`. The retry leg still runs the
  normal checks and passes. An unknown `action_id` on this flow fails loudly. Confirmed the
  rule does **not** leak into other flows — an `error` on a non-OOS `on_select` is still
  tolerated as optional.
- Regression-checked after the change: all seven previously-verified legs still clean —
  `select`/`on_select` (Prepaid), `select0` (OOS), `on_search` broadcast (75 passes),
  `on_search-1` (2), `search-0` (9), `search-1` (5).
- **Mandatory customer + city consistency + provider-existence: 20/20 assertions.** All five
  real legs stay clean (`select` 6, `on_select` 4, `select0` 6, OOS rejection 1, OOS retry 4).
  A missing `customer` object now fails on both `select` and `on_select`; a missing
  `fulfillments` array fails; a missing `customer.id` fails; `organization.descriptor.name`
  fails on `select` but a trimmed organization is accepted on `on_select` (§2b). The
  `on_search` save-spec captures `city` (`std:080`), a matching city passes, a mismatch
  fails, and no stored `on_search` skips silently. Provider existence verified live against
  the real `on_search` catalog, with unknown `provider.id` and unknown item id both failing.
- Cross-call checks were proven with synthetic `select`/`on_search` data (no Redis available
  in this environment): provider.id mismatch, an item not present in `select`, a
  `location_id` mismatch against what `select` sent, and the minimum-order-value comparison
  both below and above the threshold.
- Self-contained checks were proven by seeding dangling `location_id`/`fulfillment_id`
  references, missing `provider.id`, non-integer/zero `quantity.count`, missing
  `area_code`, and missing `customer.id`/`organization.descriptor.name`.
- `npx tsc --noEmit` clean; `npm run build` ships `selectChecks.js` and the new
  `save-specs/RETeB2B/1.2.5/select.yaml` to `dist/`.

---

## 5. A separate finding, not acted on here

While extracting real payloads, the actual flow definitions in `automation-specifications`
(`config/flows/eB2B/Order_to_confirm_to_fulfillment__Prepaid_.yaml` etc.) turned out to
**not match** this repo's `ReportingConfig.yaml` declarations for these flows:

- The real flows start directly at `select` — there is **no `search`/`on_search` step at
  all** before it. `ReportingConfig.yaml` currently declares `[search, on_search, select,
  on_select, ...]` for every order flow.
- The real flows end with far more granular steps than one generic `on_status`:
  `on_status_accepted`, `on_status_packed`, `on_status_agent_assigned`, `on_status_picked`,
  `track`, `on_track`, `on_status_out_for_delivery`, `on_status_order_delivered` (14 steps
  total for the Prepaid flow; 16 for the OOS flow, which also has the extra `select0`/
  `on_select_out_of_stock` pair at the front).

This matters because `processPayloads()` caps how many payloads it validates at
`requiredSequence.length` (the exact bug fixed earlier for
`Discovery_flow_broadcast_search`) — if a real session for these flows sends more payloads
than the declared sequence length, the later ones (most of the `on_status_*` steps,
`track`/`on_track`) would silently never be validated. `select` itself is unaffected (it's
payload #1 in the real flow, well within any plausible declared length), which is why this
wasn't blocking the current task — but it's a latent gap worth fixing in a follow-up, since
every one of these flows is shorter in `ReportingConfig.yaml` than its real sequence.
