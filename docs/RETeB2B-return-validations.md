# RETeB2B 1.2.5 — Return / part-cancel validations (`update`, `on_update`)

Code: `src/validations/ONDC:RETeB2B/1.2.5/returnChecks.ts`, wired from `update.ts` and `OnUpdate.ts`.
Save-specs: `update.yaml` and `on_update.yaml` (both new), plus `quote_breakup` added to `confirm.yaml`.

## Calibration sources

Each rule below holds on all three of these sources:

| Source | Scenario | Numbers |
|---|---|---|
| Live session `C9fAExqD2HDYdrY4Pln6_R3kiQozxBBy` | **Partial** return | 6 of 12 × I1 @ 52.00, quote 624.00 → 312.00, trail −312, refund 312 |
| Spec `Buyer_Initiated_Return__Full_Order_and_Partial_Order_.yaml` (examples) | **Full** return | 20 of 20 × I1 @ 52.00, quote 1040.00 → 0.00, trail −1040, refund 1040 |
| Spec `Merchant_Side_RTO_and_Part_Order_Cancellation_Flow.yaml` (examples) | **Part cancel** | 1 of 1 × I1 @ 52.00, quote 52.00 → 0.00, trail −52.00, refund 52.00 |

I ran all 10 eB2B spec flows and the live session through the full `validationModule`. The new checks
produced **zero failures** on any of them.

## Checks

### 1. Return state progresses in order — `validateReturnStateProgression` (on_update)

| action_id | Return fulfillment must be in |
|---|---|
| `on_update_return_init` | `Return_Initiated` |
| `on_update_return_approved` | `Return_Approved` |
| `on_update_return_picked` | `Return_Picked` |
| `on_update_settlement_trail` | `Return_Delivered` |

- A leg in this table that carries no `Return` fulfillment fails.
- Across successive `on_update`s, a Return fulfillment's state must never rank lower than in the
  previous `on_update` (Initiated 1 < Approved 2 < Picked 3 < Delivered 4).
- Other action_ids (for example `on_update_part_cancel`) skip the per-leg rule.

### 2. Return id continuity — `validateReturnRequest` (update) + `validateReturnIdContinuity` (on_update)

- **`update_return`:** `return_request` must have `id`, `item_id`, and a positive-integer
  `item_quantity`. The item must be in the confirmed order, with quantity no more than ordered. If
  `fulfillment.id` is present it must equal `return_request.id`.
- **`on_update`:** a Return fulfillment must carry the id the buyer raised. Its own
  `return_request.id` must agree with it, and its `item_id` / `item_quantity` must equal what the
  buyer raised.
- **Where the raised id comes from:** `update_return` until `update_settlement_trail` overwrites
  the saved `update`. After that, it comes from the previous `on_update`.

### 3. Refund arithmetic — `validateAdjustmentArithmetic` (on_update) + `validateRefundSettlement` (update)

> Since 2026-10-14 this arithmetic also counts **`RTO`** fulfillments and also runs on **`on_cancel`**.
> See `docs/RETeB2B-merchant-rto-part-cancel-verification.md`.

These checks apply to every `Return` or `Cancel` fulfillment that carries `quote_trail`:

- Each `quote_trail` item value must equal −(quantity moved onto that fulfillment in `items[]` × unit
  price). The unit price is taken from confirm's breakup first, and from the current leg's breakup as
  a fallback.
- **Returns only:** the quantity moved in `items[]` must equal `return_request.item_quantity`.
- The item's remaining breakup count must equal ordered − returned/cancelled. A missing breakup line
  counts as 0.
- `quote.price.value` must equal confirm's `quote_price` + Σ `quote_trail`.
- A Return fulfillment at `Return_Picked` or later **must** carry `quote_trail`.
- **`update_settlement_trail`:** must have at least one `settlement_phase: refund` entry. Σ
  `settlement_amount` must equal −Σ `quote_trail` booked in the previous `on_update`, and the
  Return/Cancel fulfillment it names must be one the seller booked.

## Seeded-defect proof (live payloads, one field changed each)

| # | Defect | Caught by |
|---|---|---|
| 1 | approved leg reports `Return_Initiated` | per-leg state |
| 2 | picked leg regresses to `Return_Initiated` | per-leg state + moved backwards |
| 3 | Return fulfillment id swapped in on_update | id continuity |
| 4 | on_update echoes `item_quantity` 5 instead of 6 | id continuity (echo) |
| 5 | quote_trail −300 instead of −312 | trail recompute + quote total + refund mismatch |
| 6 | quote total 320.00 | quote total |
| 7 | breakup still bills 7 | remaining quantity |
| 8 | quote_trail dropped at Return_Picked | trail required + refund has nothing to match |
| 9 | refund 300 instead of 312 | refund amount |
| 10 | return 13 of 12 ordered | return request + echo on each later on_update |
| 11 | refund names an unbooked fulfillment | refund fulfillment id |
| 12 | return leg carries no Return fulfillment | per-leg state |

## Deliberate non-checks

| Not checked | Why |
|---|---|
| `quote_trail` at `Return_Initiated` | The spec **template** shows one (−500), but its **example** does not, and neither does the live run. The example is authoritative. |
| Refund `settlement_counterparty` = `buyer` | All three sources send `buyer`, but a prepaid order whose payment the buyer app collected may legitimately be refunded to `buyer-app`. That case isn't calibrated. |
| `on_update_settlement_trail` echoing the refund | Neither the live run nor the spec example repeats the refund settlement in the seller's on_update. It only carries `sale-amount`. |
| `payments[].params.amount` reduced after a return | It stays at the original amount collected (624.00 / 1040.00) in every source. It records what was paid, not what is owed. |
| Strict advance (equal state allowed) | An unsolicited repeat `on_update` at the same state is not a defect. Skipping a state is caught by the per-leg rule wherever the action_id is known. |
| Return states outside the four ranked ones (`Return_Rejected`, `Return_Pick_Failed`, …) | Not in any eB2B flow. They are reported as "not compared" rather than failed. |
| Return reason-code vs provider return policy | Needs the catalog's return-policy tags. This is still a TODO in `OnUpdate.ts`. |
| Cancel fulfillment state progression / id continuity | The part cancel is unsolicited, with no buyer-raised anchor. It is held only to the arithmetic and refund rules. |
