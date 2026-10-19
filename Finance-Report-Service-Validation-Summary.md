# Finance Report Service — Validation Summary

*automation-report-service · ONDC:FIS10–FIS14 (Gift Cards, Lending, Insurance, Mutual Funds)*

A single consolidated list of every validation implemented across the Finance report flows, organized by validation type rather than by source file. Rows marked **[GAP]** are not implemented — they are included so the boundary of current coverage is explicit, not because they exist today.

**Categories:** Mandatory/Required · Business · Calculation · Trail/Audit · API/Request · Database · Gap

---

## Required / Mandatory Fields

| # | Category | Validation | Description | Failure Behavior |
|---|----------|------------|-------------|-------------------|
| 1 | API | Session ID required | Report generation requires a `sessionId` query parameter on the request. | HTTP 400 returned before any validation runs. |
| 2 | API | API key required | Request must carry a valid API key. | HTTP 403. |
| 3 | Mandatory | Context object presence | Every payload must contain a `context` object. | Required-field failure recorded; domain-specific checks are skipped for that payload. |
| 4 | Mandatory | Core context fields | `domain`, `action`, `version`/`core_version`, `message_id`, `transaction_id`, `timestamp` must all be present. | Failure recorded per missing field. |
| 5 | Mandatory | Timestamp format | `context.timestamp` must match ISO-8601 with milliseconds. | Format failure recorded. |
| 6 | Mandatory | Country / city presence | `context.country`/`city` or their nested location-code equivalents must be present. | Failure recorded if both forms are missing. |
| 7 | Mandatory | BAP/BPP identifier format | `bap_id`/`bpp_id` must match a bare-hostname pattern; `bap_uri`/`bpp_uri` must be a valid `http(s)://` URL. | Failure recorded. |
| 8 | Mandatory | Transaction ID recognition | The current `transaction_id` must match one already recorded for this session/flow. | Failure recorded if unrecognized. |
| 9 | Mandatory | Payment object completeness (Lending) | `payment.id`/`type`/`status` required; a `POST_FULFILLMENT` payment additionally requires amount, currency, and a time window. Skipped for credit-card flows. | Failure recorded per missing field. |
| 10 | Mandatory | Order references trace to catalog | Provider/item/fulfillment IDs used after selection must trace back to IDs actually offered in the flow's `on_search`. | Failure recorded if an unknown ID is referenced. |

## API / Request-Shape Validation

| # | Category | Validation | Description | Failure Behavior |
|---|----------|------------|-------------|-------------------|
| 11 | API | Sync ack/nack schema | Synchronous responses are schema-checked: context shape, `message.ack.status` must be `ACK` or `NACK`, and a `NACK` requires `error.code`/`error.message`. | Schema validation failure recorded. |

## Quote Validations

| # | Category | Validation | Description | Failure Behavior |
|---|----------|------------|-------------|-------------------|
| 12 | Business | Quote decimal precision | Quote price and every breakup line must carry ≤2 decimal places. | Failure recorded. |
| 13 | Mandatory | Tax line presence | At least one breakup line must be labeled "tax" — presence only, not the amount or rate. | Failure recorded if no tax-titled line exists. |
| 14 | Business | Item price ↔ breakup consistency | Every ordered item must have a matching breakup line by item ID, with a matching price. | Failure recorded — "breakup line not found" or price mismatch. |
| 15 | **[GAP]** | Quote existence / status / expiry / duplicate detection | Not implemented as explicit checks. Quote presence is only an implicit guard before other checks run; there is no quote-status, expiry, or duplicate-quote logic. A quote-ID-consistency check exists in code but is deliberately excluded from the active check list. | N/A — no failure is ever raised for these conditions. |

## Quote Calculation Validations

| # | Category | Validation | Description | Failure Behavior |
|---|----------|------------|-------------|-------------------|
| 16 | Calculation | Quote total = breakup sum (universal) | `quote.price.value` must exactly equal the sum of all breakup lines (lines titled `NET_DISBURSED_AMOUNT` excluded from the sum). Runs for every domain/action carrying a quote, and re-checked a second time by a universal cross-flow layer. | Failure: "quote price does not match breakup total." |
| 17 | Calculation | Gift card quote breakup | Same total-vs-breakup check for gift cards, with unicode/whitespace normalization and a 0.01 tolerance. | Failure recorded if difference exceeds tolerance. |
| 18 | Calculation | Gift card item and offer math | An `ITEM` breakup line must equal unit price × quantity; an `OFFER` breakup line must be ≤ 0 (never a positive charge); on cancellation, quote total and all breakup/quantity values must be zeroed. | Failure recorded on mismatch or a positive offer line. |
| 19 | Calculation | Loan principal / interest / deductions (Lending) | Let `D` = processing fee + other upfront charges + insurance charges + other charges. Quote total must equal Principal + Interest + D (±₹1); Net Disbursed Amount must equal Principal − D (±₹1). *Defined in code; no confirmed call site found wiring it into the live validation path — treat as unconfirmed.* | Failure recorded if outside ±₹1 tolerance. |
| 20 | Calculation | EMI / installment formula (Lending) | EMI computed as `P·r·(1+r)^n / ((1+r)^n − 1)` (r = monthly rate) must match the declared installment amount (±₹1); Interest must equal (EMI × Tenure) − Principal (±₹1); quote total must equal (EMI × Tenure) + D (±₹1). Same unconfirmed-wiring caveat as row 19. | Failure recorded if outside tolerance. |
| 21 | Calculation | Buyer-finder-fee / settlement amount (Lending) | Three modes: flat amount (Settlement = BFF amount, ±₹0.01); percent (Settlement = Principal × BFF%); percent-annualized (Settlement = Principal × BFF% × tenure in years). | Failure recorded if settlement doesn't match the applicable formula. |
| 22 | Calculation | Quote / payment / BFF / settlement arithmetic (Insurance) | Quote total = breakup sum; payment amount = quote total; BFF amount = BFF% × quote total (also range-checked 0–100% when only a percentage is given); a `BASE_PRICE` breakup line must equal the item's order price; Settlement = quote − BFF when BAP-collected, or quote (or quote − BFF) when BPP-collected. | Failure recorded per mismatched check. |
| 23 | **[GAP]** | TDS/TCS, generic discount, and generic commission formulas | No terminology or logic found for TDS/TCS anywhere in the validation layer. Discount handling is limited to the gift-card "offer line must be ≤ 0" sign check; no generic commission formula exists outside the buyer-finder-fee calculations above. | N/A — nothing is checked for these. |

## Finance-Specific Validations

| # | Category | Validation | Description | Failure Behavior |
|---|----------|------------|-------------|-------------------|
| 24 | Business | Currency = INR (Insurance) | Item price, payment params, and quote price currency must equal `"INR"`. Insurance-domain only. | Failure recorded. |
| 25 | Business | Breakup currency consistency (Gift Cards) | Every breakup line's currency must match the quote's main currency (no hardcoded ISO code). Gift-card domain only. | Failure recorded. |
| 26 | **[GAP]** | Currency validation (Lending, Mutual Funds) | No currency check exists for these two domains. | N/A. |
| 27 | Business | Order status enum | Order status must be one of a fixed set of values; a solicited status check must resolve to `COMPLETED`. | Failure recorded. |
| 28 | Business | Status transition legality (Insurance) | Prior→current order status must be an allowed transition per a fixed transition map. Insurance-domain only. | Failure recorded. |
| 29 | Business | Fulfillment state progression | Forward-only progression (initiated → processing → processed → granted), with a rejected state valid from any point. Insurance and Gift Card domains. | Failure recorded if state regresses. |
| 30 | Business | Payment amount = quote total (Insurance) | Every payment's declared amount must equal the quote price. | Failure recorded. |
| 31 | Business | Machine-only tag flag | Buyer/seller terms tags must have their `display` field set to `false` when present, marking them machine-only. | Failure recorded. |
| 32 | Business | Created ≤ updated timestamp (Insurance) | An order's created timestamp must not be later than its updated timestamp. | Failure recorded. |
| 33 | Business | Loan terms vs. catalog limits (Lending) | Interest rate, tenure, and loan amount must fall within limit values published in the flow's `on_search` response. | Failure recorded if out of range. |
| 34 | Business | Selection vs. catalog consistency (Lending) | Provider, items, and fulfillments chosen at selection must exist in the flow's `on_search` catalog. | Failure recorded. |
| 35 | **[GAP]** | Debit/credit and reconciliation | No debit/credit ledger validation of any kind, and no reconciliation logic for finance domains (a similarly-named but unrelated domain constant exists elsewhere in the codebase). | N/A. |

## Trail / Audit Validations

| # | Category | Validation | Description | Failure Behavior |
|---|----------|------------|-------------|-------------------|
| 36 | Trail | Timestamp monotonicity | Each payload's timestamp must be strictly after the previous payload's timestamp in the same flow. | Failure recorded. |
| 37 | Trail | Participant identity stability | BAP identifier/URI and BPP identifier/URI must not change once established earlier in the flow. | Failure recorded if either changes mid-flow. |
| 38 | Trail | Order trail vs. catalog | Provider/item/fulfillment IDs used in later actions must trace back to what the flow's `on_search` actually offered. | Failure recorded. |
| 39 | Trail | Cross-action price/context persistence | Prices, context, provider, and item data are snapshotted per action and compared against the same fields in later actions (e.g. confirm vs. on_confirm, init vs. on_init) — implemented per domain, using a short-lived (1-hour) cache rather than durable storage. | Failure recorded on mismatch (e.g. "price mismatch," "missing item"). |
| 40 | Trail | Action history log | Each action name is appended to a per-session/transaction history list, supporting traceability of the sequence of calls. | Not itself a pass/fail check — a supporting record only. |
| 41 | **[GAP]** | Durable / long-lived audit trail | All trail data lives in a 1-hour-TTL cache; nothing is retained once a session's cache entries expire. There is no permanent record of previous-vs-current state. | N/A — trail is simply unavailable after expiry. |

## Database Validations

| # | Category | Validation | Description | Failure Behavior |
|---|----------|------------|-------------|-------------------|
| 42 | **[GAP]** | Database-level constraints | The service has no database at all — no ORM/driver dependency and no schema/model/migration files exist. All persistence is either a short-lived cache or delegated to an external system out of this service's scope. | N/A — no NOT NULL, unique, foreign-key, or enum-at-storage constraint exists anywhere in this service. |

## Error Handling / Report-Level Behavior

| # | Category | Validation | Description | Failure Behavior |
|---|----------|------------|-------------|-------------------|
| 43 | API | Transport-level errors | Missing session ID, missing/invalid API key, and unhandled exceptions return HTTP 400, 403, and 500 respectively. | Standard HTTP error response. |
| 44 | **[GAP]** | Domain/finance validation failures never change HTTP status | Every business, quote, calculation, or finance-specific failure above is recorded only inside the generated report body — the HTTP response is always `200 OK`. A generic 422 response path exists in code but is never invoked. | Report renders "failed" text; response and status code are unaffected. |
| 45 | **[GAP]** | Field-level failures don't affect flow verdict | A flow's overall PASS/FAIL is computed only from whether the action sequence matched the expected order — not from any quote, calculation, or finance-specific check above. A flow can show overall PASS while carrying a quote-arithmetic or settlement failure in its body. | Flow marked PASS regardless of business-validation failures. |

---

*Consolidated validation summary for the Finance (ONDC:FIS10–FIS14) report flows in automation-report-service — organized by validation type, not by source file.*
