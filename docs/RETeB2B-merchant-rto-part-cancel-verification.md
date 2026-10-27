# RETeB2B — Merchant_Side_RTO_and_Part_Order_Cancellation_Flow: how it works, verification, validations

- **Session:** `C9fAExqD2HDYdrY4Pln6_R3kiQozxBBy` (dev-workbench, role BAP). Both sides of this session
  are workbench mocks: `bap_id` = `bpp_id` = `dev-workbench.ondc.tech`.
- **Transaction:** `628c2fc2-c807-4fa5-bfab-27a99eadf518` · order `889978`
- **Payloads:** 14, all ACKed. They follow the spec's 14 steps exactly
- **Date:** 2026-10-14

## Sources and precedence

| Source | Location | Role |
|---|---|---|
| **API contract** | `/tmp/ebb2b_doc.txt`. Scenario 1 *Part Cancel by Merchant* (L10650); `/on_cancel (RTO flow)` (L20143); *Fulfillment states & mapping to order states* (L22547) | **Authority where it is unambiguous** (decision of 2026-10-14) |
| Spec flow | `automation-specifications/config/flows/eB2B/Merchant_Side_RTO_and_Part_Order_Cancellation_Flow.yaml` | Followed only where the contract contradicts itself |
| Mock source | `automation-config-service/src/config/RETeB2B/v-1.2.5/EB2B/flows/…` | The same RTO legs as the spec, so the mock reproduces the spec's defects |
| Reason codes | `log-validation-utility/constants/reasonCodeRet1.2.5.ts` (B2C retail) | Informational only. The eB2B contract uses `006`, which is in neither this table nor L1 |
| Live | the 14 payloads above | — |

## 1. How the flow works

Prepaid order: I1 × 12 @ 52.00 = **624.00**, `ON-ORDER`, `PAID`, collected by the BAP.

| # | action_id | Sender | What happens |
|---|---|---|---|
| 1–6 | select → on_confirm | BAP ↔ BPP | ordinary prepaid order formation |
| 7 | `on_update_part_cancel` | BPP, unsolicited | The merchant cancels **1 × I1**. Allowed only while F1 is `Pending` (contract L10651). A **separate `Cancel` fulfillment** carries `cancel_request{reason_id 002, initiated_by}` and `quote_trail −52.00`. Items: F1 × 11, cancel × 1. Quote 624 → **572** |
| 8 | `update_settlement_trail` | BAP | The buyer app reports the refund: `settlement_phase: refund`, 52.00 to the buyer. The contract calls this FYI, so **no callback** |
| 9–12 | `on_status_packed` → `_out_for_delivery` | BPP | Forward delivery of the remaining 11. The Cancel fulfillment is carried along, unchanged |
| 13 | `on_cancel_rto` | BPP, unsolicited | Delivery fails (reason **013**, "buyer refused to accept delivery"). F1 → `Cancelled`, with `cancel_request{retry_count, rto_id, reason_id, initiated_by}` and `precancel_state{fulfillment_state, updated_at}` = where F1 was. A **new `RTO` fulfillment** is created: its id is the `rto_id`, state `RTO-Initiated`, `start` = the buyer's address, `end` = the store. Items move onto it (× 11) with `quote_trail −572.00`. Quote → **0.00** |
| 14 | `on_status_rto_delivered` | BPP, unsolicited | The goods are back at the store. Per the contract's state table, **the RTO fulfillment → `RTO-Delivered`** and the order stays `Cancelled` |

The money reconciles at every step: 624 − 52 (part cancel) − 572 (RTO) = 0.

## 2. Verdict on the live session

**Before this change: 14/14 legs PASS, 0 failures, which was wrong.** Real defects passed silently,
and the final leg passed *because* our rule encoded the defect.

**After: 11 failures, all real, on 4 legs.**

| # | Leg | Defect | Contract basis | Origin |
|---|---|---|---|---|
| D1 | on_status_rto_delivered | F1 goes from `Cancelled` back to **`Packed`** (with an agent). The **RTO fulfillment is gone**, yet `items[]` still puts 11 units on `rto_mock_id_121` | State table L22572-74: `RTO-Delivered` is the RTO fulfillment's terminal state. `Cancelled` is terminal | spec example |
| D2 | on_update_part_cancel, update_settlement_trail | `params.amount` **1150** / `transaction_id` **3937** vs **624.00 / 8539** at confirm | The contract's 1150 is *its own* order total, unchanged after part cancel | mock and spec copy contract literals |
| D3 | on_update_part_cancel | `order.state` **Created** after on_confirm's `Accepted` | Contract Scenario 1 keeps `Accepted` | spec example |
| D4 | on_update_part_cancel | `order.created_at` = **2023-06-03**, earlier than the order | — | spec example |
| D5 | on_cancel_rto | `cancellation.reason.id` **007** ≠ F1 `cancel_request.reason_id` **013**. `cancelled_by: "BPP"` is a literal, not a participant id | 007 is *retired* in the reason table. The contract's cancelled_by is a subscriber id | spec example |

Present in the live logs but **not** made rules (see §5):

| # | Defect | Origin |
|---|---|---|
| D6 | From leg 7 on, F1 `start`/`end` contacts and address are replaced by contract placeholders (`nobody@nomail.com`, `560037`, "my building name or house #") | mock and spec |

Spec-only defects (the live session gets these right). They are caught when the spec example is
validated:

| # | Spec defect |
|---|---|
| D7 | `on_cancel_rto` `precancel_state.fulfillment_state` = `Pending`, although the previous leg was `Out-for-delivery`. Live correctly says `Out-for-delivery @ 10:07:40.196Z` |
| D8 | `on_cancel_rto` F1 `cancel_request` has no `initiated_by` (the contract and L1 require it) |
| D9 | The spec's quantities are incoherent. It orders **1** unit and part-cancels that single unit, yet still runs four delivery legs. It then raises an RTO with `quote_trail −2260.00` on item id `839cb128-…`, which is not in the order |
| D10 | `select` example uses `transaction_id 3cd7243a…`, while every later leg uses `6db7d975…` |

## 3. What we validated wrongly (fixed)

| Was | Now |
|---|---|
| `STATUS_LEGS.on_status_rto_delivered` pinned F1 = **`Packed`** and required an agent. It was calibrated from the one defective spec example, and the header called the revert "legitimate". **A contract-correct seller would have false-failed** | Pinned to the contract: the `RTO` fulfillment must be `RTO-Delivered`, order `Cancelled`, no agent required (`fulfillmentType: "RTO"`). Forward-delivery rules (routing/tracking) no longer see RTO fulfillments |
| `OnCancel.ts` ran 2 checks, and its comment said the RTO flow "routes through on_update/on_status, not on_cancel" | False: `on_cancel_rto` is leg 13. Now it runs the full rule set below, including order-id continuity, which buyer cancellations lacked too |
| `OnUpdate.ts` accepted `Created` unconditionally (added 2026-10-11 to silence D3) | Still in the enum, but a regression from the last reported state now fails |
| Prepaid `on_status` passes said "payment(s) are not yet collected" for PAID payments | Worded per mode: "prepaid and already PAID" / "COD and not yet collected" |

## 4. Rules added

All of these are in `src/validations/ONDC:RETeB2B/1.2.5/`. Each emits an aggregate pass on a clean
run.

| Rule | File | Legs | Catches |
|---|---|---|---|
| `validatePaymentParamsEcho`: `params.amount`/`currency`/`transaction_id` = **confirm's** | orderFormationChecks | on_update, update (payment), on_status, on_cancel | D2 |
| `validateCreatedAtNotBeforeOrder`: `created_at` ≥ the order's confirmation | orderFormationChecks | on_update, on_status, on_cancel | D4 |
| `validateOrderStateNoRegression`: Created < Accepted < In-progress < Completed, compared against the previous on_status, else on_confirm | orderFormationChecks | on_update | D3 |
| `validateOnSelectFulfillmentRefs` (now labelled): every `items[].fulfillment_id` resolves | selectChecks | on_update, on_status, on_cancel | D1 (dangling ref) |
| `validateNoCancelledFulfillmentRevived`: `Cancelled` at on_cancel stays `Cancelled` | rtoChecks | on_status | D1 (revival) |
| RTO terminal leg pinned to the contract (above) | onStatusChecks | on_status_rto_delivered | D1 (RTO missing) |
| `validateCancelledFulfillmentStates`: order `Cancelled` ⇒ every non-RTO fulfillment `Cancelled` (contract L19326) | rtoChecks | on_cancel | — |
| `validateCancellationAttribution`: `reason.id` = the cancelled fulfillment's `cancel_request.reason_id`; `cancelled_by` ∈ {bap_id, bpp_id} | rtoChecks | on_cancel | D5 |
| `validatePrecancelState`: `fulfillment_state` = the last reported Delivery state; `updated_at` = the previous on_status's | rtoChecks | on_cancel | D7 |
| `validateRtoInitiation`: RTO id = `rto_id`; `RTO-Initiated`; origin `Cancelled` with `reason_id` + `initiated_by`; start = buyer's address, end = a provider location | rtoChecks | on_cancel | D8 |
| `validatePartCancelPrecondition`: a **new** Cancel fulfillment requires the Delivery to be `Pending` and a complete `cancel_request` (contract L10651) | rtoChecks | on_update | — |
| `validateAdjustmentArithmetic` now also counts **RTO** fulfillments, and is wired into on_cancel | returnChecks | on_update, on_cancel | D9 |

Save-specs (`src/config/save-specs/RETeB2B/1.2.5/`): new `on_confirm.yaml` (order_state,
delivery_state, fulfillment_ids) and `on_cancel.yaml` (fulfillments). `on_status.yaml` gains
delivery_state, order_state and fulfillment_ids. `confirm.yaml` gains `created_at`, used only as a
lower bound.

### Calibration

| Rule | Sources | Result |
|---|---|---|
| Payment echo vs **confirm** | every post-confirm leg of 9 order flows (spec) + 3 live sessions | unanimous, except D2. It is compared against **confirm, not on_confirm**: the return spec's on_confirm sends 1150.00 on a 1040.00 order, and Out_of_Stock's on_confirm drops `transaction_id` |
| created_at lower bound | same | unanimous, except D4 |
| Item refs resolve | same | unanimous, except D1 |
| precancel_state | 2 RTO + 2 buyer-cancel sources | state ✓ wherever the source is right (fails only D7). `updated_at` equals the previous **on_status** in both RTO sources, but is re-stamped against on_confirm in both buyer-cancel sources, so it is compared only against an on_status |
| Reason consistency / cancelled_by | 4 on_cancel sources | buyer cancel ✓ (002 = 002; `cancelled_by` = bap_id). The RTO fails in both spec and live (D5) |
| RTO structure | spec + live on_cancel_rto | ✓ both, except `initiated_by` missing in spec (D8) |

### Proof

- **Live RTO session:** 11 failures, exactly D1–D5. No others.
- **Contract-shaped variant** of the live session (D1–D5 corrected): **0 failures**, with every new
  rule reporting a pass.
- **22 seeded single-field defects** on that clean variant: each is caught by its rule.
  - Two seeds also trigger correct follow-on arithmetic failures: moving units off the RTO and dropping
    the RTO fulfillment.
  - One duplicate message was found this way and fixed (the remaining-quantity rule now runs once per
    item, not once per quote_trail).
- **The other 9 spec flows, live return and live buyer-cancel:** failure sets identical to before.
- `npx tsc --noEmit` is clean.
- Harness: in-memory (Redis stubbed, nothing written to the repo or the DB). It lives in the session
  scratchpad, not the repo.

## 5. Deliberate non-checks

| Not checked | Why |
|---|---|
| `on_cancel_rto` `order.state` | The contract contradicts itself. Its state table says RTO-Initiated keeps "the order state before RTO" (In-progress), but its own RTO example sets `Cancelled`, and the spec and live agree with the example. Only `Cancelled` is accepted, via the existing enum |
| Delivery address unchanged after confirm (D6) | Not unanimous. The mock rewrites addresses at on_init in every flow (see the buyer-cancel verification §4) as well as here. It needs its own calibration before it can be a rule |
| Reason-code ownership (who may use which code) | The only table is B2C retail. The eB2B contract uses `006`, which is in neither that table nor L1. Consistency is enforced instead (D5) |
| RTO refund | Prepaid 572.00 is never refunded: the flow has no settlement-trail step after the RTO. There is nothing to validate; reported upstream |
| `cancel_request.initiated_by` *value* | It varies legitimately across sources (`bap`, `sellerNP.com`, `lsp.com`, the bpp_id). Only presence is required |
| `precancel_state.updated_at` vs on_confirm | Re-stamped in both buyer-cancel sources (see Calibration) |
| Part cancel of the *whole* quantity (D9) | Arguably a full cancellation, but the contract does not forbid it. Reported upstream rather than enforced |

## 6. Upstream issues

**automation-specifications** (the RTO flow example; `automation-config-service` mirrors it):

1. `on_status_rto_delivered` (D1): F1 must stay `Cancelled`, and the `rto_mock_id_121` RTO
   fulfillment must be present in `RTO-Delivered`.
2. `on_update_part_cancel` (D2–D4):
   - `payments.params` must echo confirm (not the contract's `1150`/`3937`);
   - `order.state` should stay `Accepted`;
   - `created_at` must be the order's, not `2023-06-03`.
3. `on_cancel_rto` (D5, D7, D8):
   - `cancellation` `{cancelled_by: <bpp_id>, reason.id: "013"}`, or drop the block as the contract
     example does;
   - `precancel_state` must record `Out-for-delivery`;
   - add `initiated_by`.
4. `update_settlement_trail` (D2): the BAP mock copies `1150`/`3937` too.
5. D9: make the quantities coherent (order more than 1 unit; RTO item id and trail consistent with the
   order).
6. D10: the `select` example's transaction_id.
7. Mock: F1 addresses and contacts switch to contract placeholders after confirm (D6).

**Contract owners:** the RTO state-table row vs the `/on_cancel (RTO flow)` example disagree on
`order.state` at RTO-Initiated.
