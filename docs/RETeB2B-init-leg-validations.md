# ONDC:RETeB2B — `init` / `on_init` validations

Reference for the checks that run against `init` and `on_init` across the RETeB2B order
flows, domain `ONDC:RETeB2B`, version `1.2.5`. The `confirm` / `on_confirm` half of the
order-formation leg is documented in `RETeB2B-confirm-leg-validations.md`; the two share
one checks module, so the deliberate-non-checks table in §6 applies to both.

### Source files

| File | Role |
|---|---|
| `src/validations/ONDC:RETeB2B/1.2.5/init.ts` | Entry point for the request (11 checks) |
| `src/validations/ONDC:RETeB2B/1.2.5/OnInit.ts` | Entry point for the response (15 checks) |
| `src/validations/ONDC:RETeB2B/1.2.5/orderFormationChecks.ts` | All business/cross-call checks for the four order-formation actions (22 check functions + `resolvePaymentMode`) |
| `src/validations/ONDC:RETeB2B/1.2.5/commonChecks.ts` | `validateQuoteBreakup`, `validateItemPricing`, and `ISO8601_DURATION` (moved here and exported, since both the select leg's `@ondc/org/TAT` and this leg's `@ondc/org/settlement_window` need it) |
| `src/config/save-specs/RETeB2B/1.2.5/init.yaml` | New — persists billing, provider, quote price, timestamp + ttl so `on_init` can be held to them |
| `src/config/save-specs/RETeB2B/1.2.5/on_init.yaml` | New — persists the seller's quoted terms (`bpp_terms`, `settlement_details`, finder fee, quote price) so `confirm`/`on_confirm` can be held to them |
| `src/config/save-specs/RETeB2B/1.2.5/on_select.yaml` | New — persists provider/items/fulfillments/quote price so every id the order is formed around can be traced back to the quote |
| `src/utils/specLoader.ts` | **Bug fix** — see §2 |

Pass reporting follows the same rules as the `search` / `on_search` / `select` docs: a check
never claims a pass for something it just flagged, loops report an aggregate with a count,
and absent optional constructs say so explicitly (`failureGate`, reused from
`onSearchB2BChecks.ts`). Every check function emits exactly one aggregate `passed` entry on
a clean run.

Every **cross-call** check returns immediately when its stored prior state is absent, adding
**neither a pass nor a failure**. Missing state is a normal condition (first run, a flow that
legitimately skips the prior step, Redis unreachable) and must never be reported as a
protocol violation.

---

## 1. Research sources and the methodology that matters

Calibrated against the `examples[].payload` sections of **all nine** eB2B order flows in
`automation-specifications/config/flows/eB2B`:

`Order_to_confirm_to_fulfillment_(cod)` · `_(Prepaid)` · `_(Prepaid)_with_igm_1.0.0` ·
`_with_offers(cod)` · `_with_offers(Prepaid)` · `Buyer_Side_Order_Cancellation` ·
`Merchant_Side_RTO_and_Part_Order_Cancellation_Flow` ·
`Buyer_Initiated_Return_(Full_Order_and_Partial_Order)` · `Out_of_Stock(Error_code)`

**`examples[].payload` is the only authoritative layer.** Each step in those YAMLs also has a
*template* (between `action_id:` and `saveData:`), and for the COD files the template is
contaminated with Prepaid copy-paste. The COD `on_init` template declares `ON-ORDER` /
`BPP` and a payment `uri` at `Order_to_confirm_to_fulfillment__cod_.yaml:735-737`, while its
own adjacent example at `:881` sends `ON-FULFILLMENT` / `BPP` and no uri. Calibrating
against templates would both miss real rules and bake in false ones.

### Ground truth across all nine flows

| field | `init` | `on_init` |
|---|---|---|
| `payments[].type` / `collected_by` | mode-agnostic stub `ON-FULFILLMENT` / `BPP` in **every** flow, Prepaid included | per-mode (see §3) |
| `payments[].status` | absent | `NOT-PAID` in all nine — `PAID` first appears at `confirm` |
| `params` | absent | absent |
| finder fee type/amount | absent | `percent` / `3.54` |
| `@ondc/org/settlement_details` | absent | present, `seller-app` / `sale-amount` / `upi` |
| `@ondc/org/settlement_basis` / `_window` / `_withholding_amount` | absent | **absent** — agreed at `confirm` |
| `order.tags` | `[]` | `bpp_terms` + `credit` |
| `order.quote` | **present** (price + two breakup lines) | present |
| `order.created_at` / `updated_at` | absent | absent |
| `context.ttl` | `PT30S` | `PT30S` |

Note `settlement_counterparty` is **`seller-app`** for eB2B — for both COD and Prepaid, in
all nine flows. The B2C retail rule pinning COD to `buyer-app` is not ported.

---

## 2. A dead cross-call layer, found and fixed

`src/utils/specLoader.ts`'s `saveFromElement` read the payload version as
`context?.version` only. **RETeB2B payloads declare `core_version: "1.2.5"` and no
`version` at all**, so the guard `if (transactionId && domainKey && version && action)`
never passed and **nothing was ever persisted for this domain**. Every cross-call check that
reads save-spec data skipped silently — including the pre-existing
`validateSelectAgainstCatalog`, `validateCityConsistency`, `validateMinimumOrderValue`,
`validateOnSelectProviderConsistency`, `validateOnSelectItemsAgainstSelect` and
`compareOrderIdContinuity`.

The fix is the same `version || core_version` precedence every domain validator already
uses (e.g. `src/validations/ONDC:FIS12/validator.ts:7`). ONDC 1.x contexts
(retail / eB2B / logistics) carry `core_version`; 2.x contexts (FIS/TRV) carry `version`.

Blast radius is confined to RETeB2B: `loadSaveSpec` has exactly one caller, the 2.x domains
already supplied `version`, and `LOG10`/`LOG11`'s save-specs sit under directories named
`ONDC:LOG10/` while `domainKey` resolves to `LOG10`, so those paths still miss and stay
inert exactly as before. Measured effect on the previously verified actions: **only
`on_select` changed, 5 → 7 passes**, because its two select-cross-check functions now
actually run. See §7.

---

## 3. Payment mode resolution

`resolvePaymentMode(flowId)` matches the flow-id suffix **exact-case** — `(cod)` is
lowercase and `(Prepaid)` has a capital P in every spec flow id — so a case-insensitive
match cannot classify one as the other. It returns `null` for the four flows with no marker.

| Mode | Lock applies at | Expected |
|---|---|---|
| `cod` | `on_init`, `confirm`, `on_confirm` | `ON-FULFILLMENT` / `BPP` |
| `prepaid` | `confirm`, `on_confirm` **only** | `ON-ORDER` / `BAP` |
| `null` | nowhere | only enum validity + internal continuity |

**Why `init` is excluded for both modes.** Every flow's `init` example — Prepaid included —
sends the mode-agnostic stub `ON-FULFILLMENT` / `BPP`; the buyer app has not chosen a
payment instrument yet. A COD lock there is vacuous and a Prepaid lock there would
false-fail all three Prepaid flows. This also makes an `init` → `on_init` payment-mode
continuity check **impossible**, so none is attempted.

**Why `on_init` is excluded for Prepaid.**
`Order_to_confirm_to_fulfillment_with_offers(Prepaid)` ships an `on_init` with the
incoherent `ON-ORDER` + `collected_by: BPP` combination. COD's `on_init` is clean in both
`(cod)` flows, so the COD lock does apply from `on_init` onward.

**Why the four unmarked flows get no mode rule.** Their own examples are internally
incoherent about payment mode, carrying the same contamination signature as the COD
templates:

| Flow | `init` | `on_init` | `confirm` |
|---|---|---|---|
| `Buyer_Side_Order_Cancellation` | ON-FULFILLMENT/BPP | ON-ORDER/BPP + `uri` | ON-FULFILLMENT/BPP |
| `Merchant_Side_RTO_…` | ON-FULFILLMENT/BPP | ON-ORDER/BPP + `uri` | ON-ORDER/BAP |
| `Buyer_Initiated_Return_(…)` | ON-FULFILLMENT/BPP | ON-ORDER/BPP + `uri` | ON-FULFILLMENT/BPP |
| `Out_of_Stock(Error_code)` | ON-FULFILLMENT/BPP | ON-FULFILLMENT/BPP | ON-FULFILLMENT/BPP + `uri` |

Verified, not guessed — the ambiguity is real, so no mode is asserted for them.

---

## 4. `init` (request)

| Function | Asserts | Example failure |
|---|---|---|
| `validateBillingDetails` | `order.billing` present with a non-empty `name`; `billing.tax_number`, when present, is a valid GSTIN (a real one, `29AABCU9603R1ZM`, in all nine flows) | `init: order.billing.tax_number '29AABCU9603R1Z' is not a valid GSTIN` |
| `validatePaymentsPresence` | `order.payments` is a non-empty array | `init: order.payments must be a non-empty array` |
| `validatePaymentEnums` | `type` ∈ `[ON-ORDER, ON-FULFILLMENT, POST-FULFILLMENT]` and required; `collected_by` ∈ `[BAP, BPP]` and required; `status` ∈ `[PAID, NOT-PAID]` and `tl_method` ∈ `[http/get, http/post, payto, upi]` when present | `init: payments[0].type 'PRE-ORDER' is not one of ON-ORDER, ON-FULFILLMENT, POST-FULFILLMENT` |
| `validatePaymentModeLock` | **No-op at `init`** (§3), kept in the call list so the gating is visible at the call site | — |
| `validateCodPaymentConstraints` | COD only, and `init` carries nothing to violate — effectively a no-op here | — |
| `validatePaidTransactionId` | `status === PAID` ⇒ `params.transaction_id` present. No-op at `init`, which never declares a status | — |
| `validateSettlementDetails` | No-op on every reference `init` (settlement is the seller's to declare). Kept so a buyer app that does send one is still held to the enums | — |
| `validateItemPricing` (shared) | `price.value`, when present, is a non-negative number | — |
| `validateQuoteBreakup` (shared) | `quote.price.value` equals the sum of `quote.breakup[].price.value`. **`init` does carry a quote**, so this applies from here, not only from `on_init` | — |
| `validateIdsAgainstOnSelect` | Cross-call: `provider.id`, every `items[].id` and every `fulfillments[].id` trace back to what `on_select` quoted | `init: item 'I99' was not quoted in on_select` |
| `validateQuotePriceNoDrift` | Cross-call: `quote.price.value` is unchanged from `on_select`'s | `init: quote.price.value (53.00) has drifted from the value quoted in on_select (52.00)` |

`validatePaymentEnums` replaces the old `init.ts`'s `VALID_PAYMENT_TYPES`, which wrongly
included `PRE-ORDER` — not a member of the eB2B OpenAPI `Payment.type` enum.

`validateIdsAgainstOnSelect` also checks `fulfillments[].start.location.id` against
on_select's, but only when on_select declared at least one start location. In practice
on_select declares none in all nine flows while `on_confirm` introduces `L1`, so that branch
is a **silent no-op today** — written so a seller who does declare start locations is held
to them, rather than false-failing every flow.

A clean COD `init` produces **8 passed entries**.

---

## 5. `on_init` (response)

| Function | Asserts | Example failure |
|---|---|---|
| `validatePaymentsPresence` | as above | — |
| `validatePaymentEnums` | as above | — |
| `validatePaymentModeLock` | COD ⇒ `ON-FULFILLMENT` / `BPP`. **Prepaid is not locked here** (§3) | `on_init: payments[0] declares type 'ON-ORDER'/collected_by 'BPP', but flow 'Order_to_confirm_to_fulfillment_(cod)' is COD (expected ON-FULFILLMENT/BPP)` |
| `validateCodPaymentConstraints` | COD only: `status !== PAID`, and `uri`, `tl_method`, `params.transaction_id` all absent — cash is collected at fulfillment, so no gateway is in the loop. One message per violation, so two simultaneous ones are both reported | `on_init: payments[0].uri must not be sent for a COD flow (payment is collected on fulfillment), got 'https://snp.com/pg'` |
| `validatePaidTransactionId` | as above. No-op here — `on_init` is `NOT-PAID` in all nine flows | — |
| `validateSettlementDetails` | Per entry: `settlement_counterparty` ∈ `[buyer, buyer-app, seller-app, logistics-provider]`; `settlement_phase` ∈ `[sale-amount, withholding-amount, refund]`; `settlement_type` ∈ `[neft, rtgs, upi]`; `upi` ⇒ non-empty `upi_address`; `neft`/`rtgs` ⇒ non-empty `bank_name`, `branch_name`, `beneficiary_name`, `settlement_ifsc_code`, `settlement_bank_account_no` | `on_init: payments[0].@ondc/org/settlement_details[0] has settlement_type 'upi' but no upi_address` |
| `validateBppTerms` | `bpp_terms` tag group present; `tax_number` matches GSTIN; `provider_tax_number` matches PAN | `on_init: bpp_terms.tax_number '00ABCCH7409R1Z' is not a valid GSTIN` |
| `validateCreditTerms` (**required**) | `credit` tag group present with a non-negative decimal `credit_limit` and an RFC3339 `valid_till`. The one genuinely B2B term in the leg; all nine flows declare it here and none repeats it later, so it is required at `on_init` and validated-if-present elsewhere | `on_init: order.tags is missing the required 'credit' tag group (the business buyer's credit terms)` |
| `validateItemPricing` / `validateQuoteBreakup` (shared) | as above | — |
| `validateBillingEcho` | Cross-call: `order.billing` deep-equals `init`'s, **excluding the top-level `created_at`/`updated_at`**, reported by dotted path | `on_init: billing.name (expected "ABC Distributors", got "Someone Else") does not echo the billing declared in init` |
| `validateProviderContinuity` | Cross-call: `provider.id` and the set of `provider.locations[].id` unchanged from `init` | `on_init: provider.id 'P99' does not match the provider 'P1' the order was placed with in init` |
| `validateQuotePriceNoDrift` | Cross-call: unchanged from `init`'s | — |
| `validateCallbackTtlWindow` | Cross-call: `context.timestamp` is not before `init`'s and the gap is within the **ttl `init` itself declared** — not an invented constant. `PT30S` in the fixtures; the real gap is 17 ms | `on_init: responded 40000ms after init, past the ttl 'PT30S' (30000ms) that init declared` |
| `validateIdsAgainstOnSelect` | as above | — |

`validateSettlementBasisWindow` is **deliberately not called here**:
`@ondc/org/settlement_basis` / `_window` / `_withholding_amount` are absent from `on_init`
in all nine flows. They are agreed at `confirm`, where they are checked.

A clean COD `on_init` produces **14 passed entries**.

---

## 6. Deliberate non-checks (applies to both docs)

Recorded with the reason so they are not "fixed" back later. Items marked **payload-forced**
were in the approved plan and had to be dropped or narrowed once the reference payloads were
read.

| Not enforced | Why |
|---|---|
| **payload-forced** — `bap_terms` must not carry `static_terms` | Simply false for eB2B. Every reference `confirm` and `on_confirm`, in all nine flows, sends `static_terms: https://github.com/ONDC-Official/NP-Static-Terms/buyerNP_BNP/1.0/tc.pdf` |
| **payload-forced** — `bap_terms.tax_number` as a GSTIN | Its reference value is the literal placeholder `gst_number_of_buyerNP`. Only `bpp_terms.tax_number` and `order.billing.tax_number` are real GSTINs, so only those two are regex-checked |
| **payload-forced** — `order.created_at` immutable `confirm` → `on_confirm` | The reference values legitimately differ (COD `…595Z` at confirm vs `…612Z` at on_confirm) in all nine flows |
| **payload-forced** — `quote.breakup[].item.quantity` must be absent | Every reference breakup item line carries `item.quantity.available.count` / `maximum.count`. Would false-fail all four actions |
| **payload-forced** — whole-group `bpp_terms` deep-equality `on_init` → `on_confirm` | Four flows legitimately **add** `np_type: MSN` and `accept_bap_terms: Y` at `on_confirm`. The echo is field-scoped to `tax_number` + `provider_tax_number` and tolerates added entries |
| **payload-forced** — `bap_terms.accept_bpp_terms` required at `on_confirm` | Required at `confirm` (all nine send `Y`), but **absent at `on_confirm` in four of nine flows** — those same four express the seller's acceptance as `bpp_terms.accept_bap_terms` instead |
| **payload-forced** — payment `type`/`collected_by` continuity `init` → `on_init` | Impossible: every `init` sends the mode-agnostic stub (§3) |
| **payload-forced** — Prepaid mode lock at `on_init` | `with_offers(Prepaid)` ships `ON-ORDER` + `collected_by: BPP` there |
| A `message_id` pairing or uniqueness check | A `message_id`-uniqueness check was removed from `src/validations/shared/flowContinuityValidators.ts:28` **at the user's explicit request** ("not needed for this domain"). Not re-added in any form |
| `settlement_counterparty === "buyer-app"` for COD | B2C retail rule. eB2B uses `seller-app` for both modes in all nine flows |
| "Forbid `uri`/`tl_method` when `collected_by === BPP`" as a general rule | Only correct for COD. Prepaid-with-BPP-collect legitimately carries a payment `uri`, and six of the nine flows send one at `confirm`. Scoped to COD only |
| `@ondc/org/title_type` enum | The eB2B OpenAPI enum is stale — it omits `offer`, which the offers flows legitimately send |
| Whole-`payment` deep equality `confirm` → `on_confirm` | Too blunt; it false-fails whenever the BPP legitimately normalizes or adds a field (the prior art's `onConfirm.ts:696` does this). Replaced by the field-scoped echoes |
| An "offers must trace back to `select`" check | COD `select` sends no offers at all, and `init`'s `offers: [{id: discp10}]` is a contract-sample default absent from the catalog |
| `Math.round()` / ±₹1 quote tolerance | Far too coarse. This repo's existing 0.01 tolerance is kept throughout |
| Exact `created_at === context.timestamp` equality | Holds in all nine fixtures but needlessly brittle for a live NP that stamps the order a few ms before serialising the context. Replaced by not-future-dated + `updated_at >= created_at`, which catch the real defects |
| A fixed 5000 ms callback window | Replaced by the payload's own `context.ttl` |
| Self-Pickup / Kerbside `vehicle.registration` | B2C click-and-collect; eB2B wholesale ships via `Delivery` |
| P2P / P2H2P `routing` tag | B2C hyperlocal logistics convention (`RET11`-derived), not an eB2B concept |
| Address length/uniqueness thresholds | B2C retail policy values, unverified for eB2B |
| `collect_payment` flag gating | Inert in the prior art (swapped `setValue` args), and eB2B has no equivalent |
| `bpp_collect` payment tag | Not present in any eB2B example payload |
| JSON-schema / AJV structural validation | Removed from this repo at the user's request; no eB2B schema exists in the prior art either |
| `message_id` / `transaction_id` / `timestamp` presence and ISO-8601 format, country/city, `bpp_uri` | Already run for every domain and action by `contextValidators()` via `src/services/checkPayload.ts` |
| Timestamp monotonicity, bap/bpp identity stability, quote total vs breakup sum | Already run for every domain and action by `checkFlowContinuity()` |

---

## 7. Verification status

A scratchpad `ts-node` harness stubs **only** the Redis transport
(`RedisService.getKey`/`setKey`) with an in-memory Map, so everything above it is the real
thing: the real entry points, the real `DomainValidators` factories, and the real
`loadSaveSpec` + `extractBySpec` — hence the real JSONPaths and the real single-element
unwrap. Prior-action state is produced by actually replaying
`select → on_select → init → on_init → confirm → on_confirm`, never hand-built.

**Phase 1 — clean replay, 9 flows × 4 actions (36 legs).** Every leg emits at least one pass.
All 36 are clean except:

- `Buyer_Initiated_Return_(…)` / `on_confirm`: `params.amount (1150.00)` vs
  `quote.price.value (1040.00)`. **A genuine defect in that reference payload, not a wrong
  rule** — its own `quote.breakup` sums to `1040.00`, corroborating `price.value`, and
  `1150` appears nowhere else in the flow. Its `confirm` leg sends a correct `1040.00`.
- `Merchant_Side_RTO_…` / all four: `Transaction ID '6db7d975-…' is invalid. Expected one of:
  '3cd7243a-…'`. **Pre-existing and not from this work** — raised by the shared factory's
  `validateTransactionId`, because that flow's own `select` example uses a different
  `transaction_id` than `on_select` onward.

**Phase 2 — 57 seeded single-field mutations, all passing.** Each produces the expected
failure and no unexpected extra. Where one mutation legitimately trips two distinct checks
(e.g. breaking `settlement_details` both invalidates it and breaks its echo), the second is
recorded explicitly rather than tolerated silently.

Includes 8 **non-check regression guards** asserting that each of these produces **no**
failure: `static_terms` present; `bap_terms.tax_number` as a placeholder;
`quote.breakup[].item.quantity` present; `billing.created_at`/`updated_at` changed;
`order.created_at` differing `confirm` → `on_confirm`; `bpp_terms` gaining
`np_type`/`accept_bap_terms` at `on_confirm`; and `message_id` differing across both
request/callback pairs.

**Phase 3 — Redis-absent path.** All 12 cross-call functions verified to add neither a pass
nor a failure when handed `null` stored state, and again when handed the empty-array shape
`extractBySpec` yields for a payload with no `order` (the out-of-stock `on_select`).

**Phase 4 — the single-element unwrap.** Confirmed real: every `[*]` and filter-expression
save-spec key comes back as a **bare object**, not an array, for a one-payment /
one-settlement-entry payload. All five consumers verified to work against that shape via
`normalizeSaved`.

**Phase 5 — regression baselines.** Measured before and after this work, in both a
Redis-reachable and a Redis-unreachable run:

| Action | Doc baseline | Before (Redis up) | After (Redis up) |
|---|---|---|---|
| `search-0` | 9 | 10 | 10 |
| `on_search` | 75 | 41 | 41 |
| `search-1` | 5 | 6 | 6 |
| `on_search-1` | 2 | 2 | 2 |
| `select` | 6 | 7 | 7 |
| `on_select` | 4 | 5 | **7** |
| `select0` | 6 | 7 | 7 |
| OOS rejection | 1 | 2 | 2 |

Only `on_select` moved, 5 → 7, and that is the intended consequence of the §2 fix:
`validateOnSelectProviderConsistency` and `validateOnSelectItemsAgainstSelect` were written
long ago and had never once executed. With Redis unreachable the before/after numbers are
byte-identical, confirming this work changes nothing else.

The two remaining gaps against the doc baselines are measurement conditions, not
regressions: the `+1` on `search-0`/`search-1`/`select`/`select0`/OOS is the shared
`validateTransactionId` pass, which only fires when Redis is reachable; and `on_search` 41
vs 75 is because the doc's figure is for a **two-provider** payload while every fixture in
the spec repo carries exactly one provider.

`npx tsc --noEmit` passes clean.

### Not verified

- No run against a live session or real dev Redis — unreachable from the sandbox. The §2
  fix in particular should be confirmed in a real session, since it newly activates the
  whole save/cross-call layer for this domain.
- The `neft` / `rtgs` branch of `validateSettlementDetails` is exercised only by seeded
  mutations: all nine reference flows use `upi` exclusively.
- `validateIdsAgainstOnSelect`'s `fulfillments[].start.location.id` branch never fires
  against current fixtures (on_select declares no start locations).
