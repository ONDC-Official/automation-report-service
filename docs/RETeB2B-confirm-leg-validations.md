# ONDC:RETeB2B — `confirm` / `on_confirm` validations

Reference for the checks that run against `confirm` and `on_confirm` across the RETeB2B
order flows, domain `ONDC:RETeB2B`, version `1.2.5`.

This is the second half of the order-formation leg.
**`RETeB2B-init-leg-validations.md` is the companion document** and carries the material
that applies to both: the nine-flow calibration method and the template-contamination
warning (§1), the `specLoader.ts` dead-cross-call-layer fix (§2), payment mode resolution
(§3), the full deliberate-non-checks table (§6), and the verification record (§7). Only the
`confirm`-specific parts are repeated here.

### Source files

| File | Role |
|---|---|
| `src/validations/ONDC:RETeB2B/1.2.5/confirm.ts` | Entry point for the request (22 checks) |
| `src/validations/ONDC:RETeB2B/1.2.5/OnConfirm.ts` | Entry point for the response (25 checks) |
| `src/validations/ONDC:RETeB2B/1.2.5/orderFormationChecks.ts` | All business/cross-call checks, shared with the init leg |
| `src/validations/ONDC:RETeB2B/1.2.5/commonChecks.ts` | `validateOrderState`, `validateQuoteBreakup`, `validateItemPricing`, `compareOrderIdContinuity`, `ISO8601_DURATION` |
| `src/config/save-specs/RETeB2B/1.2.5/confirm.yaml` | Extended — keeps `order_id`/`provider`/`items`/`payments`, adds `timestamp`, `ttl`, `quote_price`, `bpp_terms`, `settlement_details`, `billing` |
| `src/config/save-specs/RETeB2B/1.2.5/on_init.yaml` | New — the source of the term echoes this leg enforces |

---

## 1. The gap this closes

The spec repo's generated **COD** validator scripts are thinner than the Prepaid ones: they
omit the `bpp_terms` echo and the `settlement_details` echo across `on_init` → `confirm`,
and the spec repo's own design doc records propagating them to the remaining flows as "a
follow-up". That is the gap closed here — and the `settlement_details` echo is applied at
**both** `confirm` and `on_confirm`, since COD's scripts omit it at both.

The echo is the rule that actually matters commercially: the bank account the seller will be
paid into, and the seller's tax identity, are quoted at `on_init` and must still hold once
the buyer has committed money to them.

### Ground truth across all nine flows

| field | `confirm` | `on_confirm` |
|---|---|---|
| `payments[].type` / `collected_by` | per-mode | per-mode |
| `payments[].status` | `NOT-PAID` (COD) / `PAID` (Prepaid, RTO) | same as `confirm` |
| `params` | `{currency, amount}`, plus `transaction_id` when `PAID` | same |
| `@ondc/org/settlement_basis` / `_window` / `_withholding_amount` | `delivery` / `P1D` / `0.00` in **all nine** | same |
| `@ondc/org/settlement_details` | byte-identical to `on_init`'s in all nine | byte-identical |
| finder fee type/amount | `percent` / `3.54` | same |
| `order.tags` | `bpp_terms` + `bap_terms` | `bpp_terms` (+`np_type`/`accept_bap_terms` in 4 flows) + `bap_terms` |
| `bap_terms.accept_bpp_terms` | `Y` in all nine | **absent in 4 of 9** |
| `order.state` | `Created` | `Accepted` |
| `order.created_at` / `updated_at` | both `=== context.timestamp` | both re-stamped to `on_confirm`'s own `context.timestamp` |

`@ondc/org/settlement_window` is **`P1D`** — a date-part duration. The B2C prior art's
`^PT\d+[MH]$` would reject it; `commonChecks.ISO8601_DURATION` accepts it.

---

## 2. `confirm` (request)

| Function | Asserts | Example failure |
|---|---|---|
| inline `order.id` check | `order.id` present | `confirm: order.id is missing` |
| `validateOrderState` (shared) | `order.state === "Created"` | `confirm: order.state 'Accepted' is unexpected, expected one of: Created` |
| `validateOrderTimestamps` (`requireCreatedAt`) | `created_at` **and** `updated_at` present and RFC3339; neither later than `context.timestamp`; `updated_at >= created_at` | `confirm: order.created_at '2027-01-01T00:00:00.000Z' is after context.timestamp '2026-05-19T10:37:17.595Z' — the order cannot be created after the call that carries it` |
| `validatePaymentsPresence` | non-empty `order.payments` | `confirm: order.payments must be a non-empty array` |
| `validatePaymentEnums` | `type`/`status`/`collected_by`/`tl_method` enum validity | — |
| `validatePaymentModeLock` | COD ⇒ `ON-FULFILLMENT`/`BPP`; Prepaid ⇒ `ON-ORDER`/`BAP`; skipped for the four unmarked flows | `confirm: payments[0] declares type 'ON-ORDER'/collected_by 'BAP', but flow 'Order_to_confirm_to_fulfillment_(cod)' is COD (expected ON-FULFILLMENT/BPP)` |
| `validateCodPaymentConstraints` | COD only: `status !== PAID`, and no `uri` / `tl_method` / `params.transaction_id` | `confirm: payments[0].params.transaction_id must not be sent for a COD flow (there is no payment-gateway transaction), got '3937'` |
| `validatePaidTransactionId` | `status === PAID` ⇒ `params.transaction_id` present. Fires for real here: `PAID` first appears at `confirm` | `confirm: payments[0].status is PAID but params.transaction_id is missing` |
| `validateSettlementDetails` | Counterparty / phase / type enums, and the per-type required fields (`upi` ⇒ `upi_address`; `neft`/`rtgs` ⇒ full beneficiary record) | `confirm: payments[0].@ondc/org/settlement_details[0] has settlement_type 'cash', not one of neft, rtgs, upi` |
| `validateSettlementBasisWindow` | `settlement_basis` ∈ `[shipment, delivery, return_window_expiry]`; `settlement_window` is a valid ISO-8601 duration (**must accept `P1D`**); `withholding_amount` is a non-negative decimal. All three required once any one of them is declared. **Not** run at `on_init`, where all nine flows omit them | `confirm: payments[0].@ondc/org/settlement_window 'PT1H30' is not a valid ISO-8601 duration` |
| `validatePaymentAmountMatchesQuote` | `params.amount` equals `quote.price.value` within 0.01, and `params.currency` equals `quote.price.currency` | `confirm: payments[0].params.amount (99.00) does not match quote.price.value (52.00)` |
| `validateBppTerms` | group present; GSTIN `tax_number`; PAN `provider_tax_number` | — |
| `validateCreditTerms` (optional) | Validated if present. Not required — no reference `confirm` repeats the credit tag | — |
| `validateBapTerms` (`requireAcceptance`) | `bap_terms` present with `accept_bpp_terms === "Y"` — the buyer app's explicit acceptance of the terms it was shown at `on_init`. Required here because this is the buyer's own request and all nine flows send `Y` | `confirm: bap_terms.accept_bpp_terms is 'N' — the buyer app must accept the seller's terms ('Y') to place the order` |
| `validateItemPricing` / `validateQuoteBreakup` (shared) | per-item pricing; quote total vs breakup sum | — |
| `validateBppTermsEcho` | **Cross-call** vs `on_init`: `tax_number` and `provider_tax_number` unchanged. Field-scoped and tolerant of added entries — see §4 | `confirm: bpp_terms.tax_number '29AABCU9603R1ZM' does not echo the value declared in on_init ('00ABCCH7409R1ZZ')` |
| `validateSettlementDetailsEcho` | **Cross-call** vs `on_init`: `settlement_details[0]` deep-equals, reported by dotted path | `confirm: settlement_details[0].upi_address (expected "abcdist@oksbi", got "attacker@okaxis") does not echo on_init` |
| `validateFinderFeeEcho` | **Cross-call** vs `on_init`: `@ondc/org/buyer_app_finder_fee_type` exact, `_amount` compared **numerically** so `"3.540"` vs `"3.54"` passes | `confirm: payments[0].@ondc/org/buyer_app_finder_fee_amount '4.00' does not echo on_init ('3.54')` |
| `validateQuotePriceNoDrift` | **Cross-call** vs `on_init` | `confirm: quote.price.value (53.00) has drifted from the value quoted in on_init (52.00)` |
| `validateBillingEcho` | **Cross-call** vs `init`, excluding the top-level `created_at`/`updated_at` | — |
| `validateProviderContinuity` | **Cross-call** vs `init`: `provider.id` + location ids | — |
| `validateIdsAgainstOnSelect` | **Cross-call** vs `on_select`: provider / item / fulfillment ids | `confirm: item 'I99' was not quoted in on_select` |

A clean COD `confirm` produces **21 passed entries**.

---

## 3. `on_confirm` (response)

Same check set, plus the three that only make sense once the order exists, and minus the
two that are the buyer's own responsibility.

| Function | Difference from `confirm` |
|---|---|
| `validateOrderState` | `Created` **or** `Accepted` (all nine flows send `Accepted`) |
| `validateOrderTimestamps` | `created_at` **not** required and **not** compared against `confirm`'s — the reference payloads legitimately re-stamp it (COD `…595Z` → `…612Z`). `updated_at` is still required and still must not be later than `context.timestamp` |
| `validateBapTerms` | **No** `requireAcceptance`. `accept_bpp_terms` is absent at `on_confirm` in four of nine flows (`Buyer_Initiated_Return`, `Buyer_Side_Order_Cancellation`, `Merchant_Side_RTO`, `Out_of_Stock`) — those same four express the *seller's* acceptance as `bpp_terms.accept_bap_terms` instead, so the buyer's flag is not expected to be repeated |
| the echoes | Read from **`confirm`**, not `on_init` — `confirm` is the committed state `on_confirm` must honour |
| `compareOrderIdContinuity` (shared, pre-existing) | `order.id` matches the id stored from `confirm` |
| `validatePaymentStatusNoRegression` | **New.** If `confirm` reported `PAID`, `on_confirm` must not revert. The seller may advance `NOT-PAID` → `PAID` (it collects the money) but may never un-settle a payment the buyer app reported as settled → `on_confirm: payment status is 'NOT-PAID' but confirm already reported it PAID — a settled payment must not revert` |
| `validateCallbackTtlWindow` | Paired against `confirm`'s timestamp and `confirm`'s own declared `ttl` |

A clean COD `on_confirm` produces **22 passed entries**.

---

## 4. Why the `bpp_terms` echo is field-scoped

A whole-group deep-equal would false-fail **four of the nine flows**. Their `on_confirm`
legitimately *adds* two entries to `bpp_terms`:

```
on_init  / confirm     bpp_terms.list = [tax_number, provider_tax_number]
on_confirm             bpp_terms.list = [tax_number, provider_tax_number, np_type, accept_bap_terms]
```

`np_type: MSN` and `accept_bap_terms: Y` are the seller declaring its network-participant
type and accepting the buyer's terms — new information, not drift. So the echo asserts only
that `tax_number` and `provider_tax_number` are unchanged, and tolerates additions.

By contrast `settlement_details[0]` is verified **byte-identical** across
`on_init`/`confirm`/`on_confirm` in all nine flows, so full deep equality is safe there.

The approved plan's blunter alternative — deep-equalling the whole `payment` object
`confirm` → `on_confirm`, as the prior art's `onConfirm.ts:696` does — is deliberately not
used: it false-fails whenever the BPP legitimately normalizes or adds a field (Prepaid's
`confirm` payment carries a `time.timestamp` that the seller re-stamps). The field-scoped
echoes replace it.

---

## 5. Deliberate non-checks and verification status

See `RETeB2B-init-leg-validations.md` §6 and §7. The items most relevant to this leg:

- `bap_terms` carrying `static_terms` is **correct**, not a violation.
- `bap_terms.tax_number` is the placeholder `gst_number_of_buyerNP` and is never
  regex-checked.
- `order.created_at` is **not** immutable `confirm` → `on_confirm`.
- `quote.breakup[].item.quantity` is **present** in every reference breakup and is not
  flagged.
- No `message_id` pairing check — one was removed from
  `src/validations/shared/flowContinuityValidators.ts:28` at the user's explicit request.
- Quote total vs breakup sum and timestamp monotonicity are already checked for every
  domain by `checkFlowContinuity()`; they are not re-implemented here.

One residual finding stands in the reference payloads themselves:
`Buyer_Initiated_Return_(Full_Order_and_Partial_Order)` / `on_confirm` sends
`params.amount: "1150.00"` against a `quote.price.value` of `"1040.00"`. Its own
`quote.breakup` sums to `1040.00` and its `confirm` leg sends a correct `1040.00`, so
`params.amount` is the defective field — `validatePaymentAmountMatchesQuote` is reporting a
real inconsistency in that example, not a miscalibration. The other 35 of 36 flow/action
legs are clean.
