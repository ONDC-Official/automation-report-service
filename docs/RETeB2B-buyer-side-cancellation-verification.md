# RETeB2B — Buyer_Side_Order_Cancellation verification (with contract)

- **Session:** `C9fAExqD2HDYdrY4Pln6_R3kiQozxBBy` (role BAP, dev-workbench)
- **Transaction:** `18e13f92-89db-4dac-9b85-e4af5ee31c78` · order `457174`
- **Payloads:** 8, all ACKed (select → on_confirm, cancel, on_cancel)
- **Report run on:** local report service `:9000` (current working tree)
- **Verified:** 2026-10-14

## Sources compared

| Source | What it is |
|---|---|
| **Contract** | *ONDC eB2B API Contract*, `## Cancellation` → `/cancel`, `/on_cancel` (`/tmp/ebb2b_doc.txt` L19222–19760) |
| **Spec** | `automation-specifications/config/flows/eB2B/Buyer_Side_Order_Cancellation.yaml`, `examples[].payload` |
| **L1** | `automation-specifications/config/validations/index.yaml` → `_TESTS_.cancel` (21 rules), `_TESTS_.on_cancel` (107 rules) |
| **Live** | the 8 payloads of this session |

## Verdict

**PASS is correct for the cancellation itself.** The cancel / on_cancel exchange matches the
contract on every point we can check except one: the `initiated_by` value. The contract and the spec
disagree there, and the live payload follows the spec.

But:

1. **The PASS rests on very few checks.** `cancel` gets 2 business checks and `on_cancel` gets 2
   (`state = Cancelled`, `cancellation` is present). Nine contract obligations that this session
   happens to satisfy are not validated at all (§3).
2. **There is a delivery-address defect the report does not see** (§4). It appears in this flow and
   also in the return-flow session.

## 1. Report result (local, all 8 legs validated)

| Leg | Checks | Failures |
|---|---|---|
| select | 7 | 0 |
| on_select | 13 | 0 |
| init | 14 | 0 |
| on_init | 19 | 0 |
| confirm | 27 | 0 |
| on_confirm | 32 | 0 |
| **cancel** | **5** (2 business + 3 context) | 0 |
| **on_cancel** | **6** (2 business + 4 context/quote) | 0 |

`valid_flow: true`, `flowResults: PASS`.

## 2. Contract vs live — `/cancel` and `/on_cancel`

| # | Contract obligation | Live | Validated today? |
|---|---|---|---|
| C1 | `/cancel` carries `order_id` = the confirmed order | `457174` = confirm ✓ | ✅ yes |
| C2 | `/cancel` carries `cancellation_reason_id` | `002` ✓ (in L1 enum) | ⚠️ presence only. The L1 enum (`002, 011, 013, 014, 016, 018, 021–024, 051–053`) is not applied |
| C3 | `/cancel` `descriptor`: `name: fulfillment`, `short_desc` = a fulfillment id, `tags.params` `force` + `ttl_response` | `fulfillment` / `F1` / `no` / `PT1H` ✓ | ❌ no |
| C4 | `/on_cancel` `order.state` = `Cancelled` | ✓ | ✅ yes |
| C5 | "order state **& all fulfillment states** to Cancelled" | F1 `Cancelled`, cancel_id_8189 `Cancelled` ✓ | ❌ no |
| C6 | `cancellation.cancelled_by` = the BAP (`bnp.com` in the example) | `dev-workbench.ondc.tech` = `context.bap_id` ✓ | ❌ presence only |
| C7 | `cancellation.reason.id` echoes the request | `002` = cancel ✓ | ❌ no |
| C8 | `on_cancel` `order.id` = confirmed order | `457174` ✓ | ❌ no (cancel has it, on_cancel doesn't) |
| C9 | Delivery fulfillment tag `cancel_request` { `reason_id`, `initiated_by` } | `002` / `bap` | ❌ no. See D1 |
| C10 | Delivery fulfillment tag `precancel_state` { `fulfillment_state`, `updated_at` } | `Pending` = on_confirm's F1 state ✓ | ❌ no |
| C11 | A `Cancel` fulfillment with `quote_trail`, and the moved quantity on its `items[]` entry | item −624.00 (12 × 52) + tax −31.20, I1 × 12 on `cancel_id_8189`, F1 × 0 ✓ | ❌ no |
| C12 | Updated quote = original order value with cancellation terms applied, else BNP NACKs **22503** | 655.20 − 655.20 = 0.00 ✓ | ❌ no |
| C13 | Payment block unchanged (COD, NOT-PAID, collected_by BPP) | identical to on_confirm ✓ | ❌ no |

**Status of C11/C12:** `returnChecks.validateAdjustmentArithmetic` already handles `Cancel`
fulfillments. It is currently wired only into `on_update`. I ran it directly on this live
`on_cancel` and it **passes**, including the tax trail line. With a seeded quote of 31.20 it fails as
expected. Wiring it into `OnCancel.ts` is a one-call change.

### Divergences between the sources (live is not at fault)

| # | Point | Contract | Spec example | Live | Treatment |
|---|---|---|---|---|---|
| D1 | `cancel_request.initiated_by` | `bnp.com` (bap_id) | `bap` | `bap` | Spec and live agree, so the payload wins. Don't enforce the contract value |
| D2 | `precancel_state.updated_at` | an earlier time (the pre-cancel stamp) | on_cancel time − 1 ms | = on_cancel timestamp | Value not comparable. Check format only |
| D3 | `order.created_at` | preserved (09:30 vs updated 11:00) | re-stamped to on_cancel time | re-stamped (07.373 vs confirm 07.062) | Same tolerance as confirm → on_confirm (already documented). Not compared across legs |
| D4 | `order.tags` (`bpp_terms`/`bap_terms`) on on_cancel | absent | absent | absent | Consistent. Not a defect |
| D5 | Payment key | `payment` (singular, a doc typo) | `payments[]` | `payments[]` | Contract typo |

### L1 rules that would misfire on this flow (for the L1 owners)

- `CANCEL_REQUEST_*`, `PRE_CANCEL_*`, `QUOTE_TRAIL_*` read `$.message.order.tags[...]`, but contract,
  spec and live all carry them on **`fulfillments[].tags`**. `PRE_CANCEL_*` also uses the code
  `pre_cancel_state`, where everyone else uses `precancel_state`. As written, these rules can never
  match.
- `PRE_CANCEL_FULFILLMENT_STATE` enum is lowercase (`pending`); payloads send `Pending`.
- `FULFILLMENTS_START_TIME_RANGE_*` / `END_TIME_RANGE_*` are required, but no source has them on
  on_cancel.
- `CONTEXT_REQUIRED_BPP_ID` / `_BPP_URI` point at `$.context.bap_id` / `bap_uri`. This is a
  copy-paste bug in L1, also present on every other action.

## 3. Gaps in our validators (not failures in this session)

> **Update 2026-10-14:** items 1–4 below are now implemented: order-id continuity, quote
> reconciliation, all fulfillments Cancelled, reason echo + `cancelled_by` ∈ {bap_id, bpp_id}, and
> precancel_state vs on_confirm. Payment-params echo was added as well (C13). On this session every
> one of them passes. See `docs/RETeB2B-merchant-rto-part-cancel-verification.md` §4. Item 5 (reason
> enum and descriptor shape) is still open.
>
> **Correction on C2:** I previously wrote that `002` is fine because it is in L1's enum. But in the
> RET 1.2.5 reason table (`log-validation-utility/constants/reasonCodeRet1.2.5.ts`), `002` "One or more
> items in the Order not available" is used by the **SNP** only, and this `/cancel` comes from the
> buyer. The contract says an SNP may NACK a reason "not applicable for BNP" with 30012. The spec
> example makes the same choice, though. The eB2B contract also uses `006`, which is in neither that
> table nor L1, so the retail ownership list isn't treated as authoritative here. Flagged, not enforced.

Ordered by value. All of these hold on the live payloads and on the spec example:

1. **on_cancel order id continuity (C8).** One call, as `cancel.ts` already does.
2. **Quote reconciliation (C11/C12).** Reuse `validateAdjustmentArithmetic`. The contract names a
   NACK code (22503) for exactly this.
3. **All fulfillments Cancelled (C5)**, plus **reason echo (C7)** and **cancelled_by = bap_id (C6)**,
   for buyer-initiated cancels.
4. **precancel_state.fulfillment_state = the state at on_confirm / latest on_status (C10).**
5. **cancel reason in the L1 enum (C2)**, and the **descriptor** shape (C3): `short_desc` must be a
   fulfillment of the order, `force` ∈ {yes, no}, `ttl_response` an ISO-8601 duration.

## 4. Defect outside the cancel legs: the delivery address

The `end.location` of the Delivery fulfillment, traced across the order. The pattern is **identical
in the return-flow session**:

| Leg | Sender | `ctx.city` | `end` area_code | `end` city | `end` gps |
|---|---|---|---|---|---|
| select | **BAP** | std:080 | **400053** | – | **19.129076,72.825803** |
| init | **BAP** | std:080 | **400053** | Bengaluru | **19.129076,72.825803** |
| on_init | BPP mock | std:080 | 560001 | Bengaluru | 12.4535,77.9283 |
| confirm | **BAP** | std:080 | **400053** | Bengaluru | **19.129076,72.825803** |
| on_confirm | BPP mock | std:080 | 560001 | Bengaluru | 12.4535,77.9283 |
| on_cancel | BPP mock | std:080 | 560001 | Bengaluru | 12.4535,77.9283 |

Two separate problems:

- **BAP side (the participant under test):** 400053 and 19.13,72.83 are Mumbai. The order is in
  `std:080` (Bengaluru), and the address itself says `city: Bengaluru`. The pin and GPS contradict
  both.
- **Seller mock:** on_init / on_confirm do not echo the buyer's delivery location. They substitute a
  fixed Bengaluru address, so the seller would deliver somewhere other than where the buyer asked.

**Neither is caught.** `validateCityConsistency` only compares `context.city` across legs, and no
check compares `fulfillments[].end.location` between init → on_init → confirm → on_confirm.

## Actions

1. **Participant (BAP):** fix the delivery `end.location`. The area_code and gps must match the
   Bengaluru address and `std:080`.
2. **Seller mock:** echo `fulfillments[].end` from init/confirm instead of a fixed address.
3. **Validators:** add §3 items 1–3 at minimum (each is a few lines; item 2 is already written). Also
   add an end-location echo check across init → on_init → confirm → on_confirm, and an
   area_code-vs-context-city consistency check.
4. **L1 owners:** the four on_cancel path and enum issues above.
