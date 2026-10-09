import { TestResult } from "../../../types/payload";
import { failureGate, tagGroupsByCode, tagValue } from "./onSearchB2BChecks";
import { ISO8601_DURATION } from "./commonChecks";

// Business and cross-call checks for the four order-formation actions —
// init / on_init / confirm / on_confirm — of ONDC:RETeB2B 1.2.5.
//
// One module rather than four: these actions share nearly all of their rule
// surface (payments, settlement, terms tags, quote) and most of the interesting
// rules are cross-call *between* them. commonChecks.ts stays reserved for
// genuinely cross-action utilities, as it was when selectChecks.ts was added.
//
// ---------------------------------------------------------------------------
// CALIBRATION — read this before "fixing" any rule back
// ---------------------------------------------------------------------------
// Every rule here was calibrated against the `examples[].payload` sections of
// ALL NINE eB2B order flows in automation-specifications/config/flows/eB2B:
//
//   Order_to_confirm_to_fulfillment_(cod)            Order_to_confirm_to_fulfillment_(Prepaid)
//   Order_to_confirm_to_fulfillment_with_offers(cod) Order_to_confirm_to_fulfillment_with_offers(Prepaid)
//   Order_to_confirm_to_fulfillment_(Prepaid)_with_igm_1.0.0
//   Buyer_Side_Order_Cancellation                    Merchant_Side_RTO_and_Part_Order_Cancellation_Flow
//   Buyer_Initiated_Return_(Full_Order_and_Partial_Order)
//   Out_of_Stock(Error_code)
//
// `examples[].payload` is the ONLY authoritative layer. The per-step *template*
// (between `action_id:` and `saveData:`) is contaminated with Prepaid
// copy-paste in the COD files — e.g. the COD on_init template declares
// ON-ORDER / BPP and a payment `uri` at Order_to_confirm_to_fulfillment__cod_.yaml:735-737,
// while its own adjacent example at :881 sends ON-FULFILLMENT / BPP and no uri.
// Calibrating against templates would both miss real rules and bake in false ones.
//
// Rules the examples forced us to DROP or NARROW (do not re-add):
//
//  - `bap_terms` must not carry `static_terms`  -> FALSE for eB2B. Every reference
//    confirm/on_confirm sends static_terms = https://github.com/ONDC-Official/NP-Static-Terms/...
//  - `bap_terms.tax_number` GSTIN regex        -> FALSE. Its reference value is the literal
//    placeholder `gst_number_of_buyerNP`. Only bpp_terms.tax_number and
//    order.billing.tax_number are real GSTINs, so only those two are regex-checked.
//  - `order.created_at` immutable confirm -> on_confirm -> FALSE. The reference values
//    legitimately differ (COD: ...595Z at confirm vs ...612Z at on_confirm).
//  - bpp_terms deep-equality on_init -> on_confirm -> FALSE. Four flows (Cancellation,
//    RTO, Buyer_Initiated_Return, Out_of_Stock) legitimately ADD `np_type` and
//    `accept_bap_terms` to bpp_terms at on_confirm. The echo is therefore field-scoped
//    to tax_number + provider_tax_number and tolerates added entries.
//  - payment type/collected_by continuity init -> on_init -> IMPOSSIBLE. Every flow's
//    init (Prepaid included) sends the mode-agnostic stub ON-FULFILLMENT / BPP.
//  - `quote.breakup[].item.quantity` must be absent -> FALSE. Every reference breakup
//    item line carries item.quantity.available.count / maximum.count.
//  - a message_id pairing/uniqueness check -> deliberately NOT added. One was removed
//    from shared/flowContinuityValidators.ts:28 at the user's explicit request
//    ("not needed for this domain").
//  - `settlement_counterparty === "buyer-app"` for COD -> B2C retail rule. eB2B uses
//    `seller-app` in all nine flows, for both COD and Prepaid.
//
// This module also deliberately does NOT re-implement what already runs for every
// domain and action via services/checkPayload.ts: contextValidators() (message_id /
// transaction_id / timestamp presence and ISO-8601 format, country/city, bpp_uri) and
// checkFlowContinuity() (timestamp monotonicity, bap/bpp identity stability, and
// quote total == breakup sum).
//
// ---------------------------------------------------------------------------
// Pass reporting and cross-call discipline
// ---------------------------------------------------------------------------
// Every check emits exactly one aggregate `passed` entry on a clean run, via
// `failureGate` — a check never claims a pass for the same thing it just flagged.
//
// Every cross-call check returns immediately when its stored prior state is absent,
// adding NEITHER a pass NOR a failure. Missing Redis state is a normal condition
// (first run, a flow that legitimately skips the prior step, Redis unreachable) and
// must never be reported as a protocol violation.

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

/** eB2B OpenAPI `Payment.type`. Note: no `PRE-ORDER` — the old init.ts allowed it, wrongly. */
const PAYMENT_TYPES = ["ON-ORDER", "ON-FULFILLMENT", "POST-FULFILLMENT"];
const PAYMENT_STATUSES = ["PAID", "NOT-PAID"];
const COLLECTED_BY = ["BAP", "BPP"];
const TL_METHODS = ["http/get", "http/post", "payto", "upi"];

const SETTLEMENT_COUNTERPARTIES = ["buyer", "buyer-app", "seller-app", "logistics-provider"];
const SETTLEMENT_PHASES = ["sale-amount", "withholding-amount", "refund"];
const SETTLEMENT_TYPES = ["neft", "rtgs", "upi"];
const SETTLEMENT_BASES = ["shipment", "delivery", "return_window_expiry"];

/** Bank-transfer settlement needs full beneficiary details; UPI needs only a VPA. */
const BANK_SETTLEMENT_FIELDS = [
  "bank_name",
  "branch_name",
  "beneficiary_name",
  "settlement_ifsc_code",
  "settlement_bank_account_no",
];

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const PRICE_TOLERANCE = 0.01;

export type PaymentMode = "cod" | "prepaid";

// ---------------------------------------------------------------------------
// Local helpers (no new dependencies — AJV and lodash are deliberately absent here)
// ---------------------------------------------------------------------------

/**
 * extractBySpec (src/utils/extract.ts:16) unwraps a JSONPath match of exactly ONE
 * element to a bare object. So a save-spec key written as `payments[*]` arrives as an
 * array when there are two payments and as a bare object when there is one — which is
 * the common case in every reference payload. Every consumer of a `[*]` or
 * filter-expression key must normalize through this, as commonChecks.validateSelectAgainstCatalog
 * and selectChecks.validateMinimumOrderValue already do.
 */
function normalizeSaved(value: any): any[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/** Structural deep equality. Written locally rather than adding a dependency. */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
}

/**
 * Recursive field-by-field diff returning dotted paths, so a mismatch names the field
 * that actually drifted instead of just saying "the objects differ".
 *
 * `skipTopLevel` excludes keys of the ROOT object only — depth is tracked separately from
 * `prefix`, because callers pass a human-readable root label (`"billing"`) as the prefix
 * and the skip list must still apply to that object's own immediate keys.
 */
function diffPaths(
  expected: any,
  actual: any,
  skipTopLevel: string[] = [],
  prefix = "",
  depth = 0
): string[] {
  const diffs: string[] = [];
  const bothObjects =
    expected && actual && typeof expected === "object" && typeof actual === "object" &&
    !Array.isArray(expected) && !Array.isArray(actual);

  if (!bothObjects) {
    if (!deepEqual(expected, actual)) {
      diffs.push(`${prefix || "value"} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    }
    return diffs;
  }

  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) {
    if (depth === 0 && skipTopLevel.includes(key)) continue;
    diffs.push(
      ...diffPaths(expected[key], actual[key], skipTopLevel, prefix ? `${prefix}.${key}` : key, depth + 1)
    );
  }
  return diffs;
}

function isAbsent(value: any): boolean {
  return value === undefined || value === null;
}

/** A non-negative decimal amount, given as a string in every eB2B payload. */
function isNonNegativeDecimal(value: any): boolean {
  if (isAbsent(value)) return false;
  const parsed = parseFloat(String(value));
  return !Number.isNaN(parsed) && parsed >= 0;
}

function paymentLabel(index: number): string {
  return `payments[${index}]`;
}

/** Payment entries, tolerating a payload that omits order.payments entirely. */
function paymentsOf(order: any): any[] {
  return Array.isArray(order?.payments) ? order.payments : [];
}

/** Parses an ISO-8601 duration to milliseconds. Returns null when unparseable. */
function durationToMs(duration: any): number | null {
  const text = String(duration ?? "");
  if (!ISO8601_DURATION.test(text)) return null;
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(text);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map((part) => (part === undefined ? 0 : Number(part)));
  // Calendar-month/year approximations are fine here: the value is only ever used as a
  // generous upper bound on a callback latency, never for date arithmetic.
  return (
    y * 365 * 86400000 + mo * 30 * 86400000 + d * 86400000 + h * 3600000 + mi * 60000 + s * 1000
  );
}

// ---------------------------------------------------------------------------
// Payment mode resolution
// ---------------------------------------------------------------------------

/**
 * The flow id carries the payment mode as a suffix marker. Matched EXACT-CASE —
 * `(cod)` is lowercase and `(Prepaid)` has a capital P in every spec flow id — so a
 * case-insensitive match cannot accidentally classify one as the other.
 *
 * Returns null for the four flows that carry no marker
 * (`Buyer_Side_Order_Cancellation`, `Merchant_Side_RTO_and_Part_Order_Cancellation_Flow`,
 * `Buyer_Initiated_Return_(...)`, `Out_of_Stock(Error_code)`). Those flows' own examples
 * are internally INCOHERENT about payment mode — e.g. Buyer_Side_Order_Cancellation sends
 * ON-FULFILLMENT/BPP at init, ON-ORDER/BPP at on_init and ON-FULFILLMENT/BPP at confirm;
 * the RTO flow sends ON-ORDER/BAP at confirm after ON-ORDER/BPP at on_init. They carry the
 * same contamination signature as the COD templates, so no mode-specific rule is enforced
 * for them: only enum validity and internal continuity apply. Verified, not guessed.
 */
export function resolvePaymentMode(flowId: string | undefined): PaymentMode | null {
  const id = String(flowId ?? "");
  if (id.includes("(cod)")) return "cod";
  if (id.includes("(Prepaid)")) return "prepaid";
  return null;
}

/**
 * Which actions each mode's type/collected_by lock may be applied at.
 *
 * `init` is excluded for BOTH modes: every flow's init example — Prepaid included —
 * sends the mode-agnostic stub `type: ON-FULFILLMENT, collected_by: BPP`. The buyer app
 * has not chosen a payment instrument yet at that point, so a COD lock there would be
 * vacuous and a Prepaid lock there would false-fail all three Prepaid flows.
 *
 * `on_init` is excluded for PREPAID only: `Order_to_confirm_to_fulfillment_with_offers(Prepaid)`
 * ships an on_init with the incoherent ON-ORDER + collected_by BPP combination, as do the
 * four mode-less flows. COD's on_init is clean in both `(cod)` flows, so the COD lock does
 * apply from on_init onward.
 */
const MODE_LOCK_ACTIONS: Record<PaymentMode, string[]> = {
  cod: ["on_init", "confirm", "on_confirm"],
  prepaid: ["confirm", "on_confirm"],
};

const MODE_EXPECTATION: Record<PaymentMode, { type: string; collected_by: string; label: string }> = {
  cod: { type: "ON-FULFILLMENT", collected_by: "BPP", label: "COD" },
  prepaid: { type: "ON-ORDER", collected_by: "BAP", label: "Prepaid" },
};

// ---------------------------------------------------------------------------
// Payments — all four actions
// ---------------------------------------------------------------------------

export function validatePaymentsPresence(order: any, label: string, result: TestResult): void {
  if (!Array.isArray(order?.payments) || order.payments.length === 0) {
    result.failed.push(`${label}: order.payments must be a non-empty array`);
    return;
  }
  result.passed.push(`${label}: order.payments has ${order.payments.length} entry/entries`);
}

/**
 * Enum validity for the payment fields, independent of flow or mode. `type` notably
 * excludes `PRE-ORDER`, which the previous init.ts accepted — it is not in the eB2B
 * OpenAPI `Payment.type` enum. `status`, `collected_by` and `tl_method` are each checked
 * only when present, since init legitimately omits status and no reference payload in any
 * of the nine flows carries a tl_method other than `http/get`.
 */
export function validatePaymentEnums(order: any, label: string, result: TestResult): void {
  const payments = paymentsOf(order);
  if (payments.length === 0) return;

  const cleanRun = failureGate(result);

  payments.forEach((payment: any, index: number) => {
    const ref = paymentLabel(index);

    if (isAbsent(payment?.type)) {
      result.failed.push(`${label}: ${ref}.type is required`);
    } else if (!PAYMENT_TYPES.includes(payment.type)) {
      result.failed.push(
        `${label}: ${ref}.type '${payment.type}' is not one of ${PAYMENT_TYPES.join(", ")}`
      );
    }

    if (!isAbsent(payment?.status) && !PAYMENT_STATUSES.includes(payment.status)) {
      result.failed.push(
        `${label}: ${ref}.status '${payment.status}' is not one of ${PAYMENT_STATUSES.join(", ")}`
      );
    }

    if (isAbsent(payment?.collected_by)) {
      result.failed.push(`${label}: ${ref}.collected_by is required`);
    } else if (!COLLECTED_BY.includes(payment.collected_by)) {
      result.failed.push(
        `${label}: ${ref}.collected_by '${payment.collected_by}' is not one of ${COLLECTED_BY.join(", ")}`
      );
    }

    if (!isAbsent(payment?.tl_method) && !TL_METHODS.includes(payment.tl_method)) {
      result.failed.push(
        `${label}: ${ref}.tl_method '${payment.tl_method}' is not one of ${TL_METHODS.join(", ")}`
      );
    }
  });

  if (cleanRun()) {
    result.passed.push(
      `${label}: all ${payments.length} payment(s) declare a valid type/status/collected_by/tl_method`
    );
  }
}

/**
 * The flow's declared payment mode must match what the payment actually says.
 *
 * Skips silently when the flow carries no mode marker, and when the action is one the
 * mode's lock does not cover — see MODE_LOCK_ACTIONS for the per-mode action list and the
 * payload evidence behind it.
 */
export function validatePaymentModeLock(
  order: any,
  label: string,
  mode: PaymentMode | null,
  flowId: string | undefined,
  result: TestResult
): void {
  if (!mode) return;
  if (!MODE_LOCK_ACTIONS[mode].includes(label)) return;

  const payments = paymentsOf(order);
  if (payments.length === 0) return;

  const expected = MODE_EXPECTATION[mode];
  const cleanRun = failureGate(result);

  payments.forEach((payment: any, index: number) => {
    if (payment?.type !== expected.type || payment?.collected_by !== expected.collected_by) {
      result.failed.push(
        `${label}: ${paymentLabel(index)} declares type '${payment?.type}'/collected_by '${payment?.collected_by}', ` +
          `but flow '${flowId}' is ${expected.label} (expected ${expected.type}/${expected.collected_by})`
      );
    }
  });

  if (cleanRun()) {
    result.passed.push(
      `${label}: all ${payments.length} payment(s) match the ${expected.label} mode of flow '${flowId}' (${expected.type}/${expected.collected_by})`
    );
  }
}

/**
 * COD-only constraints. Cash is collected by the seller at fulfillment, so there is no
 * payment gateway in the loop: no `uri` to redirect the buyer to, no `tl_method` to
 * reconcile with, no gateway `params.transaction_id`, and the order cannot already be PAID
 * while it is still being formed.
 *
 * Scoped to COD on purpose. "Forbid uri/tl_method when collected_by is BPP" is NOT a valid
 * general rule — Prepaid-with-BPP-collect legitimately carries a payment uri, and six of the
 * nine reference flows send one at confirm.
 *
 * Each violation gets its own message so two simultaneous ones are both reported.
 */
export function validateCodPaymentConstraints(
  order: any,
  label: string,
  mode: PaymentMode | null,
  result: TestResult
): void {
  if (mode !== "cod") return;

  const payments = paymentsOf(order);
  if (payments.length === 0) return;

  const cleanRun = failureGate(result);

  payments.forEach((payment: any, index: number) => {
    const ref = paymentLabel(index);

    if (payment?.status === "PAID") {
      result.failed.push(
        `${label}: ${ref}.status must not be PAID for a COD flow — payment is collected on fulfillment`
      );
    }
    if (!isAbsent(payment?.uri)) {
      result.failed.push(
        `${label}: ${ref}.uri must not be sent for a COD flow (payment is collected on fulfillment), got '${payment.uri}'`
      );
    }
    if (!isAbsent(payment?.tl_method)) {
      result.failed.push(
        `${label}: ${ref}.tl_method must not be sent for a COD flow, got '${payment.tl_method}'`
      );
    }
    if (!isAbsent(payment?.params?.transaction_id)) {
      result.failed.push(
        `${label}: ${ref}.params.transaction_id must not be sent for a COD flow (there is no payment-gateway transaction), got '${payment.params.transaction_id}'`
      );
    }
  });

  if (cleanRun()) {
    result.passed.push(
      `${label}: all ${payments.length} payment(s) honour the COD constraints (not PAID; no uri/tl_method/params.transaction_id)`
    );
  }
}

/**
 * A payment that claims to be settled must say which gateway transaction settled it.
 * Mode-independent: it fires wherever a PAID status appears, which in the reference
 * payloads is confirm/on_confirm of the Prepaid and RTO flows (each with a
 * params.transaction_id). Prepaid on_init is NOT-PAID in all nine flows — PAID first
 * appears at confirm.
 */
export function validatePaidTransactionId(order: any, label: string, result: TestResult): void {
  const payments = paymentsOf(order);
  const paid = payments.filter((payment: any) => payment?.status === "PAID");
  if (paid.length === 0) return;

  const cleanRun = failureGate(result);

  payments.forEach((payment: any, index: number) => {
    if (payment?.status !== "PAID") return;
    const transactionId = payment?.params?.transaction_id;
    if (isAbsent(transactionId) || !String(transactionId).trim()) {
      result.failed.push(
        `${label}: ${paymentLabel(index)}.status is PAID but params.transaction_id is missing`
      );
    }
  });

  if (cleanRun()) {
    result.passed.push(`${label}: all ${paid.length} PAID payment(s) carry a params.transaction_id`);
  }
}

// ---------------------------------------------------------------------------
// Settlement — on_init, confirm, on_confirm
// ---------------------------------------------------------------------------

/**
 * `@ondc/org/settlement_details` — who gets paid, at which phase, by which instrument.
 *
 * Skips entirely when no payment declares settlement_details, which is correct for `init`:
 * the buyer app has nothing to say about seller settlement, and no reference init carries it.
 *
 * `settlement_counterparty` accepts `seller-app`, which is what eB2B uses for BOTH COD and
 * Prepaid in all nine flows. The B2C retail rule pinning COD to `buyer-app` is not ported.
 */
export function validateSettlementDetails(order: any, label: string, result: TestResult): void {
  const payments = paymentsOf(order);
  const entries: { ref: string; detail: any }[] = [];
  payments.forEach((payment: any, index: number) => {
    normalizeSaved(payment?.["@ondc/org/settlement_details"]).forEach((detail: any, detailIndex: number) => {
      entries.push({ ref: `${paymentLabel(index)}.@ondc/org/settlement_details[${detailIndex}]`, detail });
    });
  });
  if (entries.length === 0) return;

  const cleanRun = failureGate(result);

  for (const { ref, detail } of entries) {
    const counterparty = detail?.settlement_counterparty;
    if (isAbsent(counterparty)) {
      result.failed.push(`${label}: ${ref}.settlement_counterparty is required`);
    } else if (!SETTLEMENT_COUNTERPARTIES.includes(counterparty)) {
      result.failed.push(
        `${label}: ${ref} has settlement_counterparty '${counterparty}', not one of ${SETTLEMENT_COUNTERPARTIES.join(", ")}`
      );
    }

    const phase = detail?.settlement_phase;
    if (isAbsent(phase)) {
      result.failed.push(`${label}: ${ref}.settlement_phase is required`);
    } else if (!SETTLEMENT_PHASES.includes(phase)) {
      result.failed.push(
        `${label}: ${ref} has settlement_phase '${phase}', not one of ${SETTLEMENT_PHASES.join(", ")}`
      );
    }

    const type = detail?.settlement_type;
    if (isAbsent(type)) {
      result.failed.push(`${label}: ${ref}.settlement_type is required`);
      continue;
    }
    if (!SETTLEMENT_TYPES.includes(type)) {
      result.failed.push(
        `${label}: ${ref} has settlement_type '${type}', not one of ${SETTLEMENT_TYPES.join(", ")}`
      );
      continue;
    }

    if (type === "upi") {
      if (isAbsent(detail?.upi_address) || !String(detail.upi_address).trim()) {
        result.failed.push(`${label}: ${ref} has settlement_type 'upi' but no upi_address`);
      }
    } else {
      // neft / rtgs — a bank transfer needs the full beneficiary record.
      for (const field of BANK_SETTLEMENT_FIELDS) {
        if (isAbsent(detail?.[field]) || !String(detail[field]).trim()) {
          result.failed.push(`${label}: ${ref} has settlement_type '${type}' but no ${field}`);
        }
      }
    }
  }

  if (cleanRun()) {
    result.passed.push(`${label}: all ${entries.length} settlement_details entry/entries are complete and valid`);
  }
}

/**
 * `@ondc/org/settlement_basis` / `_window` / `_withholding_amount` — the settlement terms
 * the two apps agree on when the order is placed.
 *
 * Caller gates this to confirm/on_confirm. Verified ABSENT from on_init in all nine flows,
 * so requiring it there would false-fail every one of them; the terms are fixed by confirm,
 * where all nine send `delivery` / `P1D` / `0.00`.
 *
 * The window is matched against commonChecks.ISO8601_DURATION, which accepts `P1D`. The
 * B2C prior art's `^PT\d+[MH]$` would reject it — do not port that pattern.
 */
export function validateSettlementBasisWindow(order: any, label: string, result: TestResult): void {
  const payments = paymentsOf(order);
  const relevant = payments.filter(
    (payment: any) =>
      !isAbsent(payment?.["@ondc/org/settlement_basis"]) ||
      !isAbsent(payment?.["@ondc/org/settlement_window"]) ||
      !isAbsent(payment?.["@ondc/org/withholding_amount"])
  );
  if (relevant.length === 0) return;

  const cleanRun = failureGate(result);

  payments.forEach((payment: any, index: number) => {
    const ref = paymentLabel(index);
    const basis = payment?.["@ondc/org/settlement_basis"];
    const window = payment?.["@ondc/org/settlement_window"];
    const withholding = payment?.["@ondc/org/withholding_amount"];
    if (isAbsent(basis) && isAbsent(window) && isAbsent(withholding)) return;

    if (isAbsent(basis)) {
      result.failed.push(`${label}: ${ref}.@ondc/org/settlement_basis is required once settlement terms are declared`);
    } else if (!SETTLEMENT_BASES.includes(basis)) {
      result.failed.push(
        `${label}: ${ref}.@ondc/org/settlement_basis '${basis}' is not one of ${SETTLEMENT_BASES.join(", ")}`
      );
    }

    if (isAbsent(window)) {
      result.failed.push(`${label}: ${ref}.@ondc/org/settlement_window is required once settlement terms are declared`);
    } else if (!ISO8601_DURATION.test(String(window))) {
      result.failed.push(
        `${label}: ${ref}.@ondc/org/settlement_window '${window}' is not a valid ISO-8601 duration`
      );
    }

    if (isAbsent(withholding)) {
      result.failed.push(`${label}: ${ref}.@ondc/org/withholding_amount is required once settlement terms are declared`);
    } else if (!isNonNegativeDecimal(withholding)) {
      result.failed.push(
        `${label}: ${ref}.@ondc/org/withholding_amount '${withholding}' is not a valid non-negative decimal`
      );
    }
  });

  if (cleanRun()) {
    result.passed.push(
      `${label}: settlement basis/window/withholding_amount valid across ${relevant.length} payment(s)`
    );
  }
}

/**
 * The amount the buyer is asked to pay must be the amount the order was quoted at.
 *
 * Caller gates this to confirm/on_confirm — `params` is absent at init and on_init in all
 * nine flows. Skips silently for a payment with no params.amount.
 *
 * Compared with the repo's existing 0.01 tolerance; the B2C prior art's Math.round()
 * +/- Rs.1 tolerance is far too coarse to catch a real pricing defect.
 */
export function validatePaymentAmountMatchesQuote(order: any, label: string, result: TestResult): void {
  const quotePrice = order?.quote?.price;
  const payments = paymentsOf(order);
  const withParams = payments.filter((payment: any) => !isAbsent(payment?.params?.amount));
  if (!quotePrice || withParams.length === 0) return;

  const quoteValue = parseFloat(String(quotePrice.value ?? ""));
  if (Number.isNaN(quoteValue)) return;

  const cleanRun = failureGate(result);

  payments.forEach((payment: any, index: number) => {
    const amount = payment?.params?.amount;
    if (isAbsent(amount)) return;
    const ref = paymentLabel(index);

    const parsed = parseFloat(String(amount));
    if (Number.isNaN(parsed)) {
      result.failed.push(`${label}: ${ref}.params.amount '${amount}' is not a valid decimal`);
    } else if (Math.abs(parsed - quoteValue) > PRICE_TOLERANCE) {
      result.failed.push(
        `${label}: ${ref}.params.amount (${amount}) does not match quote.price.value (${quotePrice.value})`
      );
    }

    const currency = payment?.params?.currency;
    if (!isAbsent(currency) && !isAbsent(quotePrice.currency) && currency !== quotePrice.currency) {
      result.failed.push(
        `${label}: ${ref}.params.currency '${currency}' does not match quote.price.currency '${quotePrice.currency}'`
      );
    }
  });

  if (cleanRun()) {
    result.passed.push(
      `${label}: all ${withParams.length} payment params amount/currency match quote.price (${quotePrice.value} ${quotePrice.currency})`
    );
  }
}

// ---------------------------------------------------------------------------
// Terms tags
// ---------------------------------------------------------------------------

/**
 * `bpp_terms` — the seller's tax identity, which the buyer app needs in order to accept
 * the seller's terms at confirm.
 *
 * Caller gates this to on_init/confirm/on_confirm: `order.tags` is an empty array at init
 * in all nine flows, so requiring it there would false-fail every one.
 *
 * Only `bpp_terms.tax_number` is regex-checked as a GSTIN here. `bap_terms.tax_number` is
 * the literal placeholder `gst_number_of_buyerNP` in every reference payload and must never
 * be regex-checked (see the module header).
 */
export function validateBppTerms(order: any, label: string, result: TestResult): void {
  const group = tagGroupsByCode(order?.tags, "bpp_terms")[0];
  if (!group) {
    result.failed.push(`${label}: order.tags is missing the required 'bpp_terms' tag group`);
    return;
  }

  const cleanRun = failureGate(result);

  const taxNumber = tagValue(group.list, "tax_number");
  if (isAbsent(taxNumber)) {
    result.failed.push(`${label}: bpp_terms is missing tax_number`);
  } else if (!GSTIN.test(String(taxNumber))) {
    result.failed.push(`${label}: bpp_terms.tax_number '${taxNumber}' is not a valid GSTIN`);
  }

  const providerTaxNumber = tagValue(group.list, "provider_tax_number");
  if (isAbsent(providerTaxNumber)) {
    result.failed.push(`${label}: bpp_terms is missing provider_tax_number`);
  } else if (!PAN.test(String(providerTaxNumber))) {
    result.failed.push(
      `${label}: bpp_terms.provider_tax_number '${providerTaxNumber}' is not a valid PAN`
    );
  }

  if (cleanRun()) {
    result.passed.push(
      `${label}: bpp_terms declares a valid GSTIN tax_number ('${taxNumber}') and PAN provider_tax_number ('${providerTaxNumber}')`
    );
  }
}

/**
 * `credit` — the credit line the seller extends to this business buyer. This is the one
 * genuinely B2B term in the leg, and it is REQUIRED at on_init: all nine flows declare it
 * there (credit_limit 25000.00 plus an RFC3339 valid_till) and none of them repeat it at
 * confirm/on_confirm, so elsewhere it is validated only if present.
 */
export function validateCreditTerms(
  order: any,
  label: string,
  result: TestResult,
  opts: { required?: boolean } = {}
): void {
  const group = tagGroupsByCode(order?.tags, "credit")[0];
  if (!group) {
    if (opts.required) {
      result.failed.push(
        `${label}: order.tags is missing the required 'credit' tag group (the business buyer's credit terms)`
      );
    }
    return;
  }

  const cleanRun = failureGate(result);

  const creditLimit = tagValue(group.list, "credit_limit");
  if (isAbsent(creditLimit)) {
    result.failed.push(`${label}: credit tag is missing credit_limit`);
  } else if (!isNonNegativeDecimal(creditLimit)) {
    result.failed.push(
      `${label}: credit.credit_limit '${creditLimit}' is not a valid non-negative decimal`
    );
  }

  const validTill = tagValue(group.list, "valid_till");
  if (isAbsent(validTill)) {
    result.failed.push(`${label}: credit tag is missing valid_till`);
  } else if (Number.isNaN(Date.parse(String(validTill)))) {
    result.failed.push(`${label}: credit.valid_till '${validTill}' is not a valid RFC3339 timestamp`);
  }

  if (cleanRun()) {
    result.passed.push(
      `${label}: credit terms declared (credit_limit '${creditLimit}', valid_till '${validTill}')`
    );
  }
}

/**
 * `bap_terms` — the buyer app's own terms, including its explicit acceptance of the seller
 * terms it was shown at on_init. Caller gates this to confirm/on_confirm, where all nine
 * flows declare the group.
 *
 * `accept_bpp_terms` is REQUIRED only on the buyer's own request (`confirm`, where all nine
 * flows send 'Y'), and merely validated-if-present on the seller's echo. Four of the nine
 * flows (Buyer_Initiated_Return, Buyer_Side_Order_Cancellation, Merchant_Side_RTO,
 * Out_of_Stock) legitimately echo a TRIMMED bap_terms at on_confirm with no
 * accept_bpp_terms — those same four instead add `accept_bap_terms: Y` to `bpp_terms`
 * there, i.e. the acceptance being expressed at on_confirm is the seller's, not a repeat
 * of the buyer's. Requiring it at on_confirm would false-fail all four.
 *
 * NOT checked, deliberately: the presence of `static_terms` (every reference confirm sends
 * a static-terms URL, so the B2C "must not contain static_terms" rule is simply false for
 * eB2B) and `bap_terms.tax_number` (the literal placeholder `gst_number_of_buyerNP` in
 * every reference payload, so never regex-checked as a GSTIN).
 */
export function validateBapTerms(
  order: any,
  label: string,
  result: TestResult,
  opts: { requireAcceptance?: boolean } = {}
): void {
  const group = tagGroupsByCode(order?.tags, "bap_terms")[0];
  if (!group) {
    result.failed.push(`${label}: order.tags is missing the required 'bap_terms' tag group`);
    return;
  }

  const cleanRun = failureGate(result);

  const accept = tagValue(group.list, "accept_bpp_terms");
  if (isAbsent(accept)) {
    if (opts.requireAcceptance) {
      result.failed.push(`${label}: bap_terms is missing accept_bpp_terms`);
    }
  } else if (accept !== "Y") {
    result.failed.push(
      `${label}: bap_terms.accept_bpp_terms is '${accept}' — the buyer app must accept the seller's terms ('Y') to place the order`
    );
  }

  if (cleanRun()) {
    result.passed.push(
      isAbsent(accept)
        ? `${label}: bap_terms declared (no accept_bpp_terms on this leg — the buyer's acceptance is given at confirm)`
        : `${label}: bap_terms accepts the seller's terms (accept_bpp_terms 'Y')`
    );
  }
}

// ---------------------------------------------------------------------------
// Order lifecycle
// ---------------------------------------------------------------------------

/**
 * `order.billing` — required at init, where the buyer first declares who is being invoiced.
 * `billing.tax_number`, when present, is a real GSTIN (29AABCU9603R1ZM in all nine flows),
 * so it is regex-checked; unlike bap_terms.tax_number, which is a placeholder.
 */
export function validateBillingDetails(order: any, label: string, result: TestResult): void {
  const billing = order?.billing;
  if (!billing || typeof billing !== "object") {
    result.failed.push(`${label}: order.billing is required`);
    return;
  }

  const cleanRun = failureGate(result);

  if (isAbsent(billing.name) || !String(billing.name).trim()) {
    result.failed.push(`${label}: order.billing.name is required`);
  }
  if (!isAbsent(billing.tax_number) && !GSTIN.test(String(billing.tax_number))) {
    result.failed.push(`${label}: order.billing.tax_number '${billing.tax_number}' is not a valid GSTIN`);
  }

  if (cleanRun()) {
    const gstinNote = isAbsent(billing.tax_number) ? "no tax_number declared" : `GSTIN '${billing.tax_number}'`;
    result.passed.push(`${label}: order.billing is present (name '${billing.name}', ${gstinNote})`);
  }
}

/**
 * `order.created_at` / `order.updated_at`.
 *
 * Deliberately NOT exact equality against context.timestamp. Exact equality does hold in
 * all nine reference payloads, but it is needlessly brittle for a live NP that stamps the
 * order a few milliseconds before serialising the context. The rules kept here are the ones
 * that catch a real defect: an order dated into the future relative to the call that carries
 * it, or an updated_at that precedes its own created_at.
 *
 * `created_at` is required at confirm (the BAP creates the order) and optional at
 * on_confirm. It is explicitly NOT compared across confirm -> on_confirm: the reference
 * values legitimately differ (COD ...595Z vs ...612Z).
 */
export function validateOrderTimestamps(
  order: any,
  context: any,
  label: string,
  result: TestResult,
  opts: { requireCreatedAt?: boolean } = {}
): void {
  const contextTs = Date.parse(String(context?.timestamp ?? ""));
  const createdAtRaw = order?.created_at;
  const updatedAtRaw = order?.updated_at;

  const cleanRun = failureGate(result);

  if (opts.requireCreatedAt && isAbsent(createdAtRaw)) {
    result.failed.push(`${label}: order.created_at is required`);
  }
  if (isAbsent(updatedAtRaw)) {
    result.failed.push(`${label}: order.updated_at is required`);
  }
  if (isAbsent(createdAtRaw) && isAbsent(updatedAtRaw)) {
    return;
  }

  const createdAt = isAbsent(createdAtRaw) ? NaN : Date.parse(String(createdAtRaw));
  const updatedAt = isAbsent(updatedAtRaw) ? NaN : Date.parse(String(updatedAtRaw));

  if (!isAbsent(createdAtRaw) && Number.isNaN(createdAt)) {
    result.failed.push(`${label}: order.created_at '${createdAtRaw}' is not a valid RFC3339 timestamp`);
  }
  if (!isAbsent(updatedAtRaw) && Number.isNaN(updatedAt)) {
    result.failed.push(`${label}: order.updated_at '${updatedAtRaw}' is not a valid RFC3339 timestamp`);
  }

  if (!Number.isNaN(contextTs)) {
    if (!Number.isNaN(createdAt) && createdAt > contextTs) {
      result.failed.push(
        `${label}: order.created_at '${createdAtRaw}' is after context.timestamp '${context.timestamp}' — the order cannot be created after the call that carries it`
      );
    }
    if (!Number.isNaN(updatedAt) && updatedAt > contextTs) {
      result.failed.push(
        `${label}: order.updated_at '${updatedAtRaw}' is after context.timestamp '${context.timestamp}' — the order cannot be updated after the call that carries it`
      );
    }
  }

  if (!Number.isNaN(createdAt) && !Number.isNaN(updatedAt) && updatedAt < createdAt) {
    result.failed.push(
      `${label}: order.updated_at '${updatedAtRaw}' precedes order.created_at '${createdAtRaw}'`
    );
  }

  if (cleanRun()) {
    result.passed.push(
      `${label}: order timestamps are coherent (created_at '${createdAtRaw}', updated_at '${updatedAtRaw}', context.timestamp '${context?.timestamp}')`
    );
  }
}

// ---------------------------------------------------------------------------
// Cross-call — the echoes COD's generated scripts are missing
// ---------------------------------------------------------------------------
// Every function below returns immediately when its stored prior state is absent,
// adding NEITHER a pass NOR a failure.

/**
 * `bpp_terms` echo on_init -> confirm/on_confirm.
 *
 * FIELD-SCOPED to tax_number and provider_tax_number, and tolerant of added entries.
 * A whole-group deep-equal would false-fail four of the nine flows (Cancellation, RTO,
 * Buyer_Initiated_Return, Out_of_Stock), whose on_confirm legitimately ADDS `np_type: MSN`
 * and `accept_bap_terms: Y` to the group. The seller's tax identity, however, must not
 * change between quoting the terms and the order being placed against them.
 */
export function validateBppTermsEcho(
  order: any,
  storedBppTerms: any,
  label: string,
  result: TestResult
): void {
  const stored = normalizeSaved(storedBppTerms)[0];
  if (!stored?.list) return;

  const current = tagGroupsByCode(order?.tags, "bpp_terms")[0];
  if (!current) return; // absence is validateBppTerms' job, not the echo's

  const cleanRun = failureGate(result);

  for (const field of ["tax_number", "provider_tax_number"]) {
    const expected = tagValue(stored.list, field);
    if (isAbsent(expected)) continue;
    const actual = tagValue(current.list, field);
    if (String(actual) !== String(expected)) {
      result.failed.push(
        `${label}: bpp_terms.${field} '${actual}' does not echo the value declared in on_init ('${expected}')`
      );
    }
  }

  if (cleanRun()) {
    result.passed.push(`${label}: bpp_terms tax_number/provider_tax_number echo on_init unchanged`);
  }
}

/**
 * `@ondc/org/settlement_details` echo on_init -> confirm/on_confirm. The bank account the
 * seller will be paid into is agreed at on_init and must not change once the buyer has
 * committed — this is the specific gap the generated COD scripts omit at BOTH confirm and
 * on_confirm, so it is applied at both here.
 *
 * Full deep equality is safe: verified byte-identical across on_init/confirm/on_confirm in
 * all nine flows.
 */
export function validateSettlementDetailsEcho(
  order: any,
  storedSettlementDetails: any,
  label: string,
  result: TestResult
): void {
  const stored = normalizeSaved(storedSettlementDetails);
  if (stored.length === 0) return;

  const current: any[] = [];
  for (const payment of paymentsOf(order)) {
    current.push(...normalizeSaved(payment?.["@ondc/org/settlement_details"]));
  }
  if (current.length === 0) return; // absence is validateSettlementDetails' job

  const cleanRun = failureGate(result);
  const expected = stored[0];
  const actual = current[0];

  const diffs = diffPaths(expected, actual, [], "settlement_details[0]");
  for (const diff of diffs) {
    result.failed.push(`${label}: ${diff} does not echo on_init`);
  }

  if (cleanRun()) {
    result.passed.push(
      `${label}: settlement_details[0] echoes on_init unchanged (${expected?.settlement_type} to ${expected?.settlement_counterparty})`
    );
  }
}

/**
 * `quote.price.value` must not drift once quoted. Chained on_select -> on_init ->
 * confirm -> on_confirm by calling this with each available prior step's stored value;
 * verified drift-free across the whole chain in all nine flows.
 *
 * Uses the repo's 0.01 tolerance, not the prior art's +/- Rs.1.
 */
export function validateQuotePriceNoDrift(
  order: any,
  storedQuotePrice: any,
  priorLabel: string,
  label: string,
  result: TestResult
): void {
  if (isAbsent(storedQuotePrice)) return;
  const expected = parseFloat(String(storedQuotePrice));
  const currentRaw = order?.quote?.price?.value;
  if (Number.isNaN(expected) || isAbsent(currentRaw)) return;

  const current = parseFloat(String(currentRaw));
  if (Number.isNaN(current)) return; // malformed value is validateQuoteBreakup's job

  if (Math.abs(current - expected) > PRICE_TOLERANCE) {
    result.failed.push(
      `${label}: quote.price.value (${currentRaw}) has drifted from the value quoted in ${priorLabel} (${storedQuotePrice})`
    );
    return;
  }
  result.passed.push(`${label}: quote.price.value (${currentRaw}) is unchanged from ${priorLabel}`);
}

/**
 * `order.billing` echo init -> on_init/confirm/on_confirm.
 *
 * EXCLUDES the top-level `created_at`/`updated_at`, which legitimately change at every
 * step in every reference payload (they are the billing record's own audit stamps, not
 * part of the invoicing identity). Every other field is compared recursively and reported
 * by dotted path, so a mismatch names the field that drifted. Verified: with those two
 * excluded, billing is identical across all four actions in all nine flows.
 */
export function validateBillingEcho(
  order: any,
  storedBilling: any,
  label: string,
  result: TestResult
): void {
  if (!storedBilling || typeof storedBilling !== "object") return;
  const current = order?.billing;
  if (!current || typeof current !== "object") return; // absence is validateBillingDetails' job

  const cleanRun = failureGate(result);

  const diffs = diffPaths(storedBilling, current, ["created_at", "updated_at"], "billing");
  for (const diff of diffs) {
    result.failed.push(`${label}: ${diff} does not echo the billing declared in init`);
  }

  if (cleanRun()) {
    result.passed.push(`${label}: order.billing echoes init unchanged (ignoring its own created_at/updated_at stamps)`);
  }
}

/**
 * `order.provider` continuity — the provider id and the set of provider location ids the
 * order is placed against must not change once init has named them. Compares against the
 * stored prior step rather than re-deriving from the catalog.
 */
export function validateProviderContinuity(
  order: any,
  storedProvider: any,
  priorLabel: string,
  label: string,
  result: TestResult
): void {
  const expectedId = storedProvider?.id;
  if (isAbsent(expectedId)) return;
  const currentId = order?.provider?.id;
  if (isAbsent(currentId)) return;

  const cleanRun = failureGate(result);

  if (String(currentId) !== String(expectedId)) {
    result.failed.push(
      `${label}: provider.id '${currentId}' does not match the provider '${expectedId}' the order was placed with in ${priorLabel}`
    );
  }

  const expectedLocations = new Set(
    (storedProvider?.locations || []).map((location: any) => location?.id).filter(Boolean)
  );
  if (expectedLocations.size > 0) {
    for (const location of order?.provider?.locations || []) {
      if (location?.id && !expectedLocations.has(location.id)) {
        result.failed.push(
          `${label}: provider.locations declares location '${location.id}', which was not among the locations declared in ${priorLabel} (${[...expectedLocations].join(", ")})`
        );
      }
    }
  }

  if (cleanRun()) {
    result.passed.push(`${label}: provider.id '${currentId}' and its location ids are unchanged from ${priorLabel}`);
  }
}

/**
 * A callback must arrive after its request and inside the window the request itself
 * declared — `context.ttl`, not an invented constant. The reference payloads declare
 * `PT30S` and the real gap is ~17 ms.
 *
 * Skips silently when the stored request timestamp or ttl is missing or unparseable;
 * monotonicity across consecutive calls is already checked universally by
 * shared/flowContinuityValidators, so this adds only the request/callback pairing.
 */
export function validateCallbackTtlWindow(
  context: any,
  storedTimestamp: any,
  storedTtl: any,
  priorLabel: string,
  label: string,
  result: TestResult
): void {
  if (isAbsent(storedTimestamp) || isAbsent(storedTtl)) return;

  const requestMs = Date.parse(String(storedTimestamp));
  const callbackMs = Date.parse(String(context?.timestamp ?? ""));
  const ttlMs = durationToMs(storedTtl);
  if (Number.isNaN(requestMs) || Number.isNaN(callbackMs) || ttlMs === null) return;

  const cleanRun = failureGate(result);

  if (callbackMs < requestMs) {
    result.failed.push(
      `${label}: context.timestamp '${context.timestamp}' precedes the ${priorLabel} it answers ('${storedTimestamp}')`
    );
  } else if (callbackMs - requestMs > ttlMs) {
    result.failed.push(
      `${label}: responded ${callbackMs - requestMs}ms after ${priorLabel}, past the ttl '${storedTtl}' (${ttlMs}ms) that ${priorLabel} declared`
    );
  }

  if (cleanRun()) {
    result.passed.push(
      `${label}: responded ${callbackMs - requestMs}ms after ${priorLabel}, within its declared ttl '${storedTtl}'`
    );
  }
}

/**
 * Every id the order is formed around must trace back to what the seller actually offered
 * in on_select: the provider, the item ids, and the fulfillment ids.
 *
 * `fulfillments[].start.location.id` is checked only when on_select declared at least one
 * start location. In practice on_select declares none in all nine flows while on_confirm
 * introduces `L1`, so that branch is a silent no-op today — but it is written so that a
 * seller who does declare start locations is held to them.
 *
 * Skips each dimension independently when on_select stored nothing for it, so an
 * out-of-stock on_select with no `order` at all is a complete no-op.
 */
export function validateIdsAgainstOnSelect(
  order: any,
  onSelectData: Record<string, any> | null,
  label: string,
  result: TestResult
): void {
  if (!onSelectData) return;

  const storedProvider = onSelectData.provider;
  const storedItems = normalizeSaved(onSelectData.items);
  const storedFulfillments = normalizeSaved(onSelectData.fulfillments);

  const cleanRun = failureGate(result);
  const checked: string[] = [];

  const expectedProviderId = storedProvider?.id;
  const currentProviderId = order?.provider?.id;
  if (!isAbsent(expectedProviderId) && !isAbsent(currentProviderId)) {
    checked.push("provider.id");
    if (String(currentProviderId) !== String(expectedProviderId)) {
      result.failed.push(
        `${label}: provider.id '${currentProviderId}' was not the provider quoted in on_select ('${expectedProviderId}')`
      );
    }
  }

  const expectedItemIds = new Set(storedItems.map((item: any) => item?.id).filter(Boolean));
  if (expectedItemIds.size > 0) {
    checked.push("items[].id");
    for (const item of order?.items || []) {
      if (item?.id && !expectedItemIds.has(item.id)) {
        result.failed.push(`${label}: item '${item.id}' was not quoted in on_select`);
      }
    }
  }

  const expectedFulfillmentIds = new Set(storedFulfillments.map((f: any) => f?.id).filter(Boolean));
  if (expectedFulfillmentIds.size > 0) {
    checked.push("fulfillments[].id");
    for (const fulfillment of order?.fulfillments || []) {
      if (fulfillment?.id && !expectedFulfillmentIds.has(fulfillment.id)) {
        result.failed.push(`${label}: fulfillment '${fulfillment.id}' was not quoted in on_select`);
      }
    }
  }

  const expectedStartLocationIds = new Set(
    storedFulfillments.map((f: any) => f?.start?.location?.id).filter(Boolean)
  );
  if (expectedStartLocationIds.size > 0) {
    checked.push("fulfillments[].start.location.id");
    for (const fulfillment of order?.fulfillments || []) {
      const locationId = fulfillment?.start?.location?.id;
      if (locationId && !expectedStartLocationIds.has(locationId)) {
        result.failed.push(
          `${label}: fulfillment '${fulfillment?.id ?? "?"}' ships from location '${locationId}', which on_select did not declare`
        );
      }
    }
  }

  if (checked.length > 0 && cleanRun()) {
    result.passed.push(`${label}: ${checked.join(", ")} all trace back to on_select`);
  }
}

/**
 * A payment that was already PAID at confirm must not revert. The seller may advance
 * NOT-PAID -> PAID (it collects the money), but it may never un-settle a payment the buyer
 * app reported as settled.
 */
export function validatePaymentStatusNoRegression(
  order: any,
  storedPayments: any,
  priorLabel: string,
  label: string,
  result: TestResult
): void {
  const stored = normalizeSaved(storedPayments);
  if (stored.length === 0) return;

  const wasPaid = stored.some((payment: any) => payment?.status === "PAID");
  if (!wasPaid) return;

  const current = paymentsOf(order);
  if (current.length === 0) return;

  const regressed = current.filter((payment: any) => payment?.status !== "PAID");
  if (regressed.length > 0) {
    result.failed.push(
      `${label}: payment status is '${regressed[0]?.status}' but ${priorLabel} already reported it PAID — a settled payment must not revert`
    );
    return;
  }
  result.passed.push(`${label}: payment status is still PAID, as ${priorLabel} reported`);
}

/**
 * `@ondc/org/buyer_app_finder_fee_type` / `_amount` — the buyer app's commission, fixed by
 * the seller at on_init (percent / 3.54 in all nine flows) and unchanged thereafter.
 *
 * The amount is compared NUMERICALLY, so a seller that re-serialises "3.54" as "3.540"
 * passes. The type is compared exactly — `percent` and `amount` mean different things.
 */
export function validateFinderFeeEcho(
  order: any,
  storedPayments: any,
  priorLabel: string,
  label: string,
  result: TestResult
): void {
  const stored = normalizeSaved(storedPayments)[0];
  const expectedType = stored?.["@ondc/org/buyer_app_finder_fee_type"];
  const expectedAmount = stored?.["@ondc/org/buyer_app_finder_fee_amount"];
  if (isAbsent(expectedType) && isAbsent(expectedAmount)) return;

  const payments = paymentsOf(order);
  if (payments.length === 0) return;

  const cleanRun = failureGate(result);

  payments.forEach((payment: any, index: number) => {
    const ref = paymentLabel(index);

    const actualType = payment?.["@ondc/org/buyer_app_finder_fee_type"];
    if (!isAbsent(expectedType) && !isAbsent(actualType) && actualType !== expectedType) {
      result.failed.push(
        `${label}: ${ref}.@ondc/org/buyer_app_finder_fee_type '${actualType}' does not echo ${priorLabel} ('${expectedType}')`
      );
    }

    const actualAmount = payment?.["@ondc/org/buyer_app_finder_fee_amount"];
    if (!isAbsent(expectedAmount) && !isAbsent(actualAmount)) {
      const expectedNum = parseFloat(String(expectedAmount));
      const actualNum = parseFloat(String(actualAmount));
      if (
        Number.isNaN(expectedNum) ||
        Number.isNaN(actualNum) ||
        Math.abs(expectedNum - actualNum) > PRICE_TOLERANCE
      ) {
        result.failed.push(
          `${label}: ${ref}.@ondc/org/buyer_app_finder_fee_amount '${actualAmount}' does not echo ${priorLabel} ('${expectedAmount}')`
        );
      }
    }
  });

  if (cleanRun()) {
    result.passed.push(
      `${label}: buyer app finder fee echoes ${priorLabel} unchanged (${expectedType} ${expectedAmount})`
    );
  }
}
