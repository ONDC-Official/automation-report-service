# RETeB2B — Buyer_Initiated_Return_(Full_Order_and_Partial_Order) verification

- **Session:** `C9fAExqD2HDYdrY4Pln6_R3kiQozxBBy` (role BAP, dev-workbench)
- **Transaction:** `442b9b08-6ff8-4817-8ccd-0c491f29b849`
- **Payloads submitted:** 18, all ACKed
- **Verified:** 2026-10-14

## Verdict

The deployed report shows **PASS / Valid**. That verdict is unreliable, for two reasons:

1. **The deployed report validated only 11 of the 18 payloads.** It stops at `on_status_5`
   (out-for-delivery). It never validated `on_status_order_delivered`, either `update`, or any of
   the four `on_update` legs, which together make up the entire return. The deployed
   `ReportingConfig.yaml` lists 11 steps for this flow (including a phantom `search/on_search` prefix
   this flow doesn't send), and `processPayloads` treats the sequence length as a hard cap.
2. **One check fails, but the flow still reports PASS.** `flowResults` is computed from `valid_flow`
   alone (`src/templates/generateReport.ts:474`), which reflects only the action sequence.
   Per-payload validation failures never change PASS/FAIL. This is pre-existing behaviour and
   applies to every domain.

## The one real failure

| Leg | Check | Value |
|---|---|---|
| `on_confirm` | `payments[0].params.amount` must equal `quote.price.value` | **1150.00** vs 624.00 |

I confirmed this against the raw payloads. Every other leg (confirm, all six on_status, all on_update)
sends `params.amount = 624.00`. Only the seller's `on_confirm` sends 1150.00. This is a genuine
defect in the seller-side (mock) on_confirm payload, not a validator false positive.

## Payload timeline

| # | action_id | order.state | quote | params.amount | fulfillment state(s) |
|---|---|---|---|---|---|
| 1 | select | – | – | – | – |
| 2 | on_select | – | 624.00 | – | F1 Serviceable |
| 3 | init | – | 624.00 | – | F1 |
| 4 | on_init | – | 624.00 | – | F1 |
| 5 | confirm | Created | 624.00 | 624.00 | F1 |
| 6 | on_confirm | Accepted | 624.00 | **1150.00** | F1 Pending |
| 7 | on_status_accepted | Accepted | 624.00 | 624.00 | F1 Pending |
| 8 | on_status_packed | In-progress | 624.00 | 624.00 | F1 Packed |
| 9 | on_status_agent_assigned | In-progress | 624.00 | 624.00 | F1 Agent-assigned |
| 10 | on_status_picked | In-progress | 624.00 | 624.00 | F1 Order-picked-up |
| 11 | on_status_out_for_delivery | In-progress | 624.00 | 624.00 | F1 Out-for-delivery |
| 12 | on_status_order_delivered | Completed | 624.00 | 624.00 | F1 Order-delivered |
| 13 | update_return | – | – | – | Return (target `item`) |
| 14 | on_update_return_init | Completed | 624.00 | 624.00 | Return_Initiated |
| 15 | on_update_return_approved | Completed | 624.00 | 624.00 | Return_Approved |
| 16 | on_update_return_picked | Completed | **312.00** | 624.00 | Return_Picked |
| 17 | update_settlement_trail | – | – | – | Return (target `payment`) |
| 18 | on_update_settlement_trail | Completed | 312.00 | 624.00 | Return_Delivered |

Rows 12–18 are missing from the deployed report: dev-workbench never validated them.

## Local run with current `main` (commits `0074763`..`87dcc00`, not yet deployed)

I ran the same 18 payloads through the local `validationModule` against a throwaway Redis, with
action_ids assigned by timestamp order as in the table above:

- All **18 legs validated**. Sequence is valid, with no sequence or mandatory-leg errors.
- The only failure is the same on_confirm `params.amount` 1150.00 ≠ 624.00.
- Per-leg on_status contracts pass for all six legs (state, agent, PAID-at-delivery, updated_at
  advancing, order id continuity).

## Coverage gaps in the return legs (not failures)

> **Update 2026-10-14:** all three gaps below are now covered. See
> `docs/RETeB2B-return-validations.md`. On this session, every new check passes.

The return half is checked only shallowly. `update` gets 4 checks and each `on_update` gets 7–8
(state enum, tags present, order id continuity, context stability, quote = breakup). Nothing
currently verifies:

- That the return fulfillment's state progresses in order
  (Return_Initiated → Return_Approved → Return_Picked → Return_Delivered).
- That the return fulfillment id in `on_update` matches the one the buyer raised in `update_return`.
- The partial-return refund arithmetic: quote drops 624.00 → 312.00 at `on_update_return_picked`.
  Nothing checks that the 312.00 reduction equals the returned item quantity × unit price, or that
  the `update_settlement_trail` refund amount matches it.

## Actions

1. **Seller mock:** fix `on_confirm` `payments[0].params.amount` (1150.00 → quote total).
2. **Deploy:** push the 6 local commits so dev-workbench uses the 18-step sequence. Until then,
   the return legs are unvalidated in every report for this flow.
3. **Optional:** make PASS/FAIL consider per-payload failures (cross-domain change, needs sign-off).
4. **Optional:** add the return-leg checks listed above.
