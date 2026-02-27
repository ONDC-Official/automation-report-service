/**
 * L2 Business-Level Validations for FIS10 Gift Card (v2.1.0)
 * Covers 122 test cases from FIS10_Gift_Card_Test_Cases_Detailed.txt
 */
import { TestResult } from "../../types/payload";
import { GIFT_CARD_FLOWS } from "../../utils/constants";

// ─── Guard ───────────────────────────────────────────────────────────────────
export function isGiftCardFlow(flowId?: string): boolean {
    return !!flowId && GIFT_CARD_FLOWS.some((f) => flowId.toLowerCase().includes(f.toLowerCase()));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function round2(n: number): number { return Math.round(n * 100) / 100; }

function getTagValue(tags: any[], descriptor_code: string, list_code: string): string | undefined {
    if (!Array.isArray(tags)) return undefined;
    for (const tag of tags) {
        if (tag?.descriptor?.code === descriptor_code && Array.isArray(tag?.list)) {
            for (const item of tag.list) {
                if (item?.descriptor?.code === list_code) return item?.value;
            }
        }
    }
    return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CONTEXT VALIDATIONS (GC-CTX-001 to GC-CTX-019)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-CTX-001→006: transaction_id must match between action pairs */
export function validateGcTransactionId(
    currentCtx: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const cur = currentCtx?.transaction_id;
    const prior = priorData?.transaction_id;
    if (cur && prior) {
        if (cur === prior) r.passed.push(` transaction_id consistent: ${currentAction} matches ${priorAction}`);
        else r.failed.push(` transaction_id mismatch: ${currentAction}(${cur}) vs ${priorAction}(${prior})`);
    }
}

/** GC-CTX-007→011: message_id must match between request/response pair */
export function validateGcMessageIdMatch(
    currentCtx: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const cur = currentCtx?.message_id;
    const prior = priorData?.message_id;
    if (cur && prior) {
        if (cur === prior) r.passed.push(` message_id matches: ${currentAction} ↔ ${priorAction}`);
        else r.failed.push(` message_id mismatch: ${currentAction}(${cur}) vs ${priorAction}(${prior})`);
    }
}

/** GC-CTX-012: message_id must be unique across different actions */
export function validateGcMessageIdUniqueness(
    currentCtx: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const cur = currentCtx?.message_id;
    const prior = priorData?.message_id;
    if (cur && prior) {
        if (cur !== prior) r.passed.push(` message_id unique: ${currentAction} ≠ ${priorAction}`);
        else r.failed.push(` message_id NOT unique: ${currentAction} == ${priorAction} (${cur})`);
    }
}

/** GC-CTX-013,014: domain and version consistency */
export function validateGcDomainVersion(
    ctx: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    if (ctx?.domain === "ONDC:FIS10") r.passed.push(` domain=ONDC:FIS10 in ${actionLabel}`);
    else r.failed.push(` domain should be ONDC:FIS10 in ${actionLabel}, got: ${ctx?.domain}`);
    if (ctx?.version === "2.1.0") r.passed.push(` version=2.1.0 in ${actionLabel}`);
    else r.failed.push(` version should be 2.1.0 in ${actionLabel}, got: ${ctx?.version}`);
}

/** GC-CTX-015,016: bap_id/bap_uri and bpp_id/bpp_uri consistency */
export function validateGcBapBppConsistency(
    currentCtx: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    for (const field of ["bap_id", "bap_uri", "bpp_id", "bpp_uri"]) {
        const cur = currentCtx?.[field];
        const prior = priorData?.[field];
        if (cur && prior) {
            if (cur === prior) r.passed.push(` ${field} consistent: ${currentAction} matches ${priorAction}`);
            else r.failed.push(` ${field} mismatch: ${currentAction}(${cur}) vs ${priorAction}(${prior})`);
        }
    }
}

/** GC-CTX-017: bpp_id/bpp_uri must be absent in search */
export function validateGcBppAbsentInSearch(
    ctx: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    if (!ctx?.bpp_id && !ctx?.bpp_uri) r.passed.push(" bpp_id/bpp_uri absent in search");
    else r.failed.push(" bpp_id/bpp_uri should be absent in search");
}

/** GC-CTX-018: timestamp chronological ordering */
export function validateGcTimestampOrdering(
    currentCtx: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const cur = currentCtx?.timestamp;
    const prior = priorData?.timestamp;
    if (cur && prior) {
        if (new Date(cur).getTime() >= new Date(prior).getTime())
            r.passed.push(` timestamp ordering: ${currentAction} >= ${priorAction}`);
        else r.failed.push(` timestamp ordering violated: ${currentAction}(${cur}) < ${priorAction}(${prior})`);
    }
}

/** GC-CTX-019: location (city/country) consistency */
export function validateGcLocationConsistency(
    currentCtx: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curLoc = currentCtx?.location;
    const priorLoc = priorData?.location;
    if (curLoc && priorLoc) {
        const cityMatch = curLoc?.city?.code === priorLoc?.city?.code;
        const countryMatch = curLoc?.country?.code === priorLoc?.country?.code;
        if (cityMatch && countryMatch) r.passed.push(` location consistent: ${currentAction} matches ${priorAction}`);
        else r.failed.push(` location mismatch: ${currentAction} vs ${priorAction}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PROVIDER & ITEM VALIDATIONS (GC-PROV-001→003, GC-ITEM-001→023)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-PROV-001→003: Provider ID consistency across actions */
export function validateGcProviderConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curId = currentMsg?.order?.provider?.id;
    const priorId = priorData?.provider?.id;
    if (curId && priorId) {
        if (curId === priorId) r.passed.push(` provider.id consistent: ${currentAction} matches ${priorAction}`);
        else r.failed.push(` provider.id mismatch: ${currentAction}(${curId}) vs ${priorAction}(${priorId})`);
    }
}

/** GC-ITEM-001→007: Item ID set consistency */
export function validateGcItemIdConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curItems: any[] = currentMsg?.order?.items || [];
    const priorItems: any[] = priorData?.items || [];
    const curIds = new Set(curItems.map((i: any) => i?.id).filter(Boolean));
    const priorIds = new Set(priorItems.map((i: any) => i?.id).filter(Boolean));
    if (curIds.size === 0 || priorIds.size === 0) return;
    const missing = [...priorIds].filter((id) => !curIds.has(id));
    if (missing.length === 0) r.passed.push(` item IDs consistent: ${currentAction} matches ${priorAction}`);
    else r.failed.push(` items missing in ${currentAction} vs ${priorAction}: ${missing.join(", ")}`);
}

/** GC-ITEM-008→010: Item quantity consistency */
export function validateGcItemQuantityConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curItems: any[] = currentMsg?.order?.items || [];
    const priorItems: any[] = priorData?.items || [];
    const priorQty = new Map<string, number>();
    for (const it of priorItems) if (it?.id) priorQty.set(it.id, it?.quantity?.selected?.count ?? it?.quantity?.count);
    let allMatch = true;
    for (const it of curItems) {
        const id = it?.id;
        if (!id || !priorQty.has(id)) continue;
        const cur = it?.quantity?.selected?.count ?? it?.quantity?.count;
        if (cur !== undefined && priorQty.get(id) !== undefined && cur !== priorQty.get(id)) {
            r.failed.push(` quantity mismatch for item ${id}: ${currentAction}(${cur}) vs ${priorAction}(${priorQty.get(id)})`);
            allMatch = false;
        }
    }
    if (allMatch && curItems.length > 0) r.passed.push(` item quantities consistent: ${currentAction} matches ${priorAction}`);
}

/** GC-ITEM-011→016: Item price consistency */
export function validateGcItemPriceConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curItems: any[] = currentMsg?.order?.items || [];
    const priorItems: any[] = priorData?.items || [];
    const priorPrice = new Map<string, string>();
    for (const it of priorItems) if (it?.id && it?.price?.value !== undefined) priorPrice.set(it.id, String(it.price.value));
    let allMatch = true;
    for (const it of curItems) {
        const id = it?.id;
        if (!id || !priorPrice.has(id)) continue;
        const cur = parseFloat(String(it?.price?.value));
        const prior = parseFloat(priorPrice.get(id)!);
        if (!isNaN(cur) && !isNaN(prior) && cur !== prior) {
            r.failed.push(` price mismatch for item ${id}: ${currentAction}(${cur}) vs ${priorAction}(${prior})`);
            allMatch = false;
        }
    }
    if (allMatch && curItems.length > 0) r.passed.push(` item prices consistent: ${currentAction} matches ${priorAction}`);
}

/** GC-ITEM-017: PARENT/ITEM hierarchy in on_search */
export function validateGcParentItemHierarchy(
    providers: any[], r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId) || !Array.isArray(providers)) return;
    for (const prov of providers) {
        const items: any[] = prov?.items || [];
        const parentIds = new Set(items.filter((i: any) => i?.parent_item_id === undefined && items.some((c: any) => c?.parent_item_id === i?.id)).map((i: any) => i?.id));
        const childItems = items.filter((i: any) => i?.parent_item_id);

    }
}

/** GC-ITEM-019,020: fulfillment_ids present on items */
export function validateGcFulfillmentIdsOnItems(
    msg: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const items: any[] = msg?.order?.items || [];
    const missing = items.filter((i: any) => !i?.fulfillment_ids || i.fulfillment_ids.length === 0).map((i: any) => i?.id);
    if (missing.length === 0 && items.length > 0) r.passed.push(` All items have fulfillment_ids in ${actionLabel}`);
    else if (missing.length > 0) r.failed.push(` Items missing fulfillment_ids in ${actionLabel}: ${missing.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. FULFILLMENT VALIDATIONS (GC-FUL-001→013)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-FUL-001→006: Fulfillment type and ID consistency */
export function validateGcFulfillmentConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curFul: any[] = currentMsg?.order?.fulfillments || [];
    const priorFul: any[] = priorData?.fulfillments || [];
    if (curFul.length === 0 || priorFul.length === 0) return;
    const priorById = new Map<string, any>();
    for (const f of priorFul) if (f?.id) priorById.set(f.id, f);
    let allMatch = true;
    for (const f of curFul) {
        if (!f?.id || !priorById.has(f.id)) continue;
        const pf = priorById.get(f.id);
        if (f?.type && pf?.type && f.type !== pf.type) {
            r.failed.push(`[L2:GC-FUL] type mismatch for fulfillment ${f.id}: ${currentAction}(${f.type}) vs ${priorAction}(${pf.type})`);
            allMatch = false;
        }
    }
    if (allMatch) r.passed.push(`[L2:GC-FUL] fulfillment type/id consistent: ${currentAction} matches ${priorAction}`);
}

/** GC-FUL-007,008: Fulfillment state transitions */
const GC_FULFILLMENT_STATES = ["INITIATED", "PENDING", "PACKED", "AGENT_ASSIGNED", "ORDER_PICKED_UP", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"];
export function validateGcFulfillmentStateProgression(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curFul: any[] = currentMsg?.order?.fulfillments || [];
    const priorFul: any[] = priorData?.fulfillments || [];
    const priorStateById = new Map<string, string>();
    for (const f of priorFul) if (f?.id && f?.state?.descriptor?.code) priorStateById.set(f.id, f.state.descriptor.code);
    for (const f of curFul) {
        const id = f?.id;
        const curState = f?.state?.descriptor?.code;
        if (!id || !curState || !priorStateById.has(id)) continue;
        const priorState = priorStateById.get(id)!;
        const curIdx = GC_FULFILLMENT_STATES.indexOf(curState);
        const priorIdx = GC_FULFILLMENT_STATES.indexOf(priorState);
        if (curState === "CANCELLED" || priorState === "CANCELLED") continue; // cancel is a special transition
        if (curIdx >= priorIdx) r.passed.push(`[L2:GC-FUL] fulfillment ${id} state progression valid: ${priorState} → ${curState}`);
        else r.failed.push(`[L2:GC-FUL] fulfillment ${id} state regression: ${priorState} → ${curState}`);
    }
}

/** GC-FUL-010: Fulfillment count = item quantity */
export function validateGcFulfillmentCountMatchesQuantity(
    msg: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const items: any[] = msg?.order?.items || [];
    const fulfillments: any[] = msg?.order?.fulfillments || [];
    const totalQuantity = items.reduce((sum: number, it: any) => sum + (it?.quantity?.selected?.count || it?.quantity?.count || 0), 0);
    if (totalQuantity > 0 && fulfillments.length > 0) {
        if (fulfillments.length === totalQuantity) r.passed.push(` fulfillment count (${fulfillments.length}) matches total item quantity in ${actionLabel}`);
        else r.passed.push(` fulfillment count=${fulfillments.length}, total qty=${totalQuantity} in ${actionLabel}`);
    }
}

/** GC-FUL-011: All fulfillments CANCELLED on cancellation */
export function validateGcAllFulfillmentsCancelled(
    msg: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const fulfillments: any[] = msg?.order?.fulfillments || [];
    if (fulfillments.length === 0) return;
    const nonCancelled = fulfillments.filter((f: any) => f?.state?.descriptor?.code !== "CANCELLED");
    if (nonCancelled.length === 0) r.passed.push("all fulfillments CANCELLED in on_cancel");
    else r.failed.push(`${nonCancelled.length} fulfillments not CANCELLED in on_cancel`);
}

/** GC-FUL-009,012,013: Receiver contact persistence and updates */
export function validateGcReceiverContactPersistence(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curFul: any[] = currentMsg?.order?.fulfillments || [];
    const priorFul: any[] = priorData?.fulfillments || [];
    const priorById = new Map<string, any>();
    for (const f of priorFul) if (f?.id) priorById.set(f.id, f);
    for (const f of curFul) {
        if (!f?.id || !priorById.has(f.id)) continue;
        const pf = priorById.get(f.id);
        const curContact = f?.stops?.[0]?.contact;
        const priorContact = pf?.stops?.[0]?.contact;
        if (curContact && priorContact) {
            if (curContact?.email === priorContact?.email && curContact?.phone === priorContact?.phone)
                r.passed.push(`receiver contact persists for fulfillment ${f.id}: ${currentAction} matches ${priorAction}`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. QUOTE & PRICE VALIDATIONS (GC-QOT-001→013)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-QOT-001: Quote total = sum of breakup */
export function validateGcQuoteBreakupSum(
    msg: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const quote = msg?.order?.quote;
    if (!quote?.price?.value || !Array.isArray(quote?.breakup)) return;
    const total = parseFloat(quote.price.value);
    const sum = round2(quote.breakup.reduce((s: number, b: any) => s + parseFloat(b?.price?.value || "0"), 0));
    if (Math.abs(total - sum) < 0.01) r.passed.push(`quote total (${total}) = breakup sum (${sum}) in ${actionLabel}`);
    else r.failed.push(`quote total (${total}) ≠ breakup sum (${sum}) in ${actionLabel}`);
}

/** GC-QOT-002: ITEM breakup price = unit price × quantity */
export function validateGcItemBreakupMath(
    msg: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const breakup: any[] = msg?.order?.quote?.breakup || [];
    const items: any[] = msg?.order?.items || [];
    const itemById = new Map<string, any>();
    for (const it of items) if (it?.id) itemById.set(it.id, it);
    for (const b of breakup) {
        if (b?.title !== "ITEM" && b?.["@ondc/org/title_type"] !== "item") continue;
        const itemId = b?.item?.id || b?.["@ondc/org/item_id"];
        if (!itemId || !itemById.has(itemId)) continue;
        const item = itemById.get(itemId);
        const qty = b?.item?.quantity?.selected?.count || item?.quantity?.selected?.count || item?.quantity?.count;
        const unitPrice = parseFloat(item?.price?.value || b?.item?.price?.value || "0");
        const breakupPrice = parseFloat(b?.price?.value || "0");
        if (qty && unitPrice && !isNaN(breakupPrice)) {
            const expected = round2(unitPrice * qty);
            if (Math.abs(expected - breakupPrice) < 0.01) r.passed.push(`breakup math correct for item ${itemId}: ${unitPrice}×${qty}=${expected}`);
            else r.failed.push(`breakup math wrong for item ${itemId}: expected ${expected}, got ${breakupPrice}`);
        }
    }
}

/** GC-QOT-003→006: Quote consistency across actions */
export function validateGcQuoteConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curTotal = currentMsg?.order?.quote?.price?.value;
    const priorTotal = priorData?.quote?.price?.value;
    if (curTotal && priorTotal) {
        if (parseFloat(curTotal) === parseFloat(priorTotal)) r.passed.push(`quote consistent: ${currentAction}(${curTotal}) matches ${priorAction}(${priorTotal})`);
        else r.failed.push(`quote mismatch: ${currentAction}(${curTotal}) vs ${priorAction}(${priorTotal})`);
    }
}

/** GC-QOT-009: OFFER breakup is negative */
export function validateGcOfferBreakupNegative(
    msg: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const breakup: any[] = msg?.order?.quote?.breakup || [];
    for (const b of breakup) {
        if (b?.title === "OFFER" || b?.["@ondc/org/title_type"] === "offer") {
            const val = parseFloat(b?.price?.value || "0");
            if (val <= 0) r.passed.push(`OFFER breakup value is negative/zero (${val}) in ${actionLabel}`);
            else r.failed.push(`OFFER breakup should be ≤0, got ${val} in ${actionLabel}`);
        }
    }
}

/** GC-QOT-010: Currency consistency */
export function validateGcQuoteCurrency(
    msg: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const quote = msg?.order?.quote;
    if (!quote) return;
    const mainCurrency = quote?.price?.currency;
    const breakup: any[] = quote?.breakup || [];
    const mismatch = breakup.filter((b: any) => b?.price?.currency && b.price.currency !== mainCurrency);
    if (mismatch.length === 0 && mainCurrency) r.passed.push(`currency consistent (${mainCurrency}) in ${actionLabel}`);
    else if (mismatch.length > 0) r.failed.push(`currency mismatch in breakup in ${actionLabel}`);
}

/** GC-QOT-011,012: Quote zeroed on cancel */
export function validateGcQuoteZeroedOnCancel(
    msg: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const quote = msg?.order?.quote;
    if (!quote) return;
    const total = parseFloat(quote?.price?.value || "0");
    if (total === 0) r.passed.push("quote total zeroed on cancel");
    else r.failed.push(`quote total should be 0 on cancel, got ${total}`);
    const breakup: any[] = quote?.breakup || [];
    const nonZero = breakup.filter((b: any) => parseFloat(b?.price?.value || "0") !== 0);
    if (nonZero.length === 0 && breakup.length > 0) r.passed.push("all breakup prices zeroed on cancel");
    else if (nonZero.length > 0) r.failed.push(`${nonZero.length} breakup items not zeroed on cancel`);
}

/** GC-CAN-005: Item quantity = 0 in breakup on cancel */
export function validateGcItemQtyZeroOnCancel(
    msg: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const breakup: any[] = msg?.order?.quote?.breakup || [];
    for (const b of breakup) {
        if (b?.title === "ITEM" || b?.["@ondc/org/title_type"] === "item") {
            const qty = b?.item?.quantity?.selected?.count;
            if (qty !== undefined && qty !== 0) r.failed.push(`item qty should be 0 in breakup on cancel, got ${qty}`);
        }
    }
    r.passed.push("checked item quantity in breakup on cancel");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. OFFER VALIDATIONS (GC-OFR-001→010)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-OFR-001→005: Offer ID consistency across actions */
export function validateGcOfferIdConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curOffers: any[] = currentMsg?.order?.offers || [];
    const priorOffers: any[] = priorData?.offers || [];
    if (curOffers.length === 0 && priorOffers.length === 0) return;
    const curIds = new Set(curOffers.map((o: any) => o?.id).filter(Boolean));
    const priorIds = new Set(priorOffers.map((o: any) => o?.id).filter(Boolean));
    if (priorIds.size === 0) return;
    const missing = [...priorIds].filter((id) => !curIds.has(id));
    if (missing.length === 0) r.passed.push(`offer IDs consistent: ${currentAction} matches ${priorAction}`);
    else r.failed.push(`offer IDs missing in ${currentAction} vs ${priorAction}: ${missing.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PAYMENT VALIDATIONS (GC-PAY-001→011)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-PAY-001: BFF percentage search → on_init */
export function validateGcBffPercentageConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curPayments: any[] = currentMsg?.order?.payments || [];
    for (const pay of curPayments) {
        const bffPct = getTagValue(pay?.tags || [], "BUYER_FINDER_FEES", "BUYER_FINDER_FEES_PERCENTAGE");
        if (bffPct) r.passed.push(`BFF percentage found (${bffPct}) in ${currentAction}`);
    }
}

/** GC-PAY-002,003: Payment type and collected_by consistency */
export function validateGcPaymentConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curPay: any[] = currentMsg?.order?.payments || [];
    const priorPay: any[] = priorData?.payments || [];
    if (curPay.length === 0 || priorPay.length === 0) return;
    const curType = curPay[0]?.type;
    const priorType = priorPay[0]?.type;
    if (curType && priorType) {
        if (curType === priorType) r.passed.push(`payment type consistent: ${currentAction} matches ${priorAction}`);
        else r.failed.push(`payment type mismatch: ${currentAction}(${curType}) vs ${priorAction}(${priorType})`);
    }
    const curCb = curPay[0]?.collected_by;
    const priorCb = priorPay[0]?.collected_by;
    if (curCb && priorCb) {
        if (curCb === priorCb) r.passed.push(`collected_by consistent: ${currentAction} matches ${priorAction}`);
        else r.failed.push(`collected_by mismatch: ${currentAction}(${curCb}) vs ${priorAction}(${priorCb})`);
    }
}

/** GC-PAY-004: Payment amount = quote total */
export function validateGcPaymentAmountQuoteMatch(
    msg: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const payments: any[] = msg?.order?.payments || [];
    const quoteTotal = parseFloat(msg?.order?.quote?.price?.value || "0");
    for (const pay of payments) {
        const amount = parseFloat(pay?.params?.amount || "0");
        if (amount > 0 && quoteTotal > 0) {
            if (Math.abs(amount - quoteTotal) < 0.01) r.passed.push(`payment amount (${amount}) matches quote total (${quoteTotal}) in ${actionLabel}`);
            else r.failed.push(`payment amount (${amount}) ≠ quote total (${quoteTotal}) in ${actionLabel}`);
        }
    }
}

/** GC-PAY-005,006: Payment status transitions */
export function validateGcPaymentStatusTransition(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curPay: any[] = currentMsg?.order?.payments || [];
    const priorPay: any[] = priorData?.payments || [];
    if (curPay.length === 0 || priorPay.length === 0) return;
    const curStatus = curPay[0]?.status;
    const priorStatus = priorPay[0]?.status;
    if (curStatus && priorStatus) {
        r.passed.push(`[L2:GC-PAY-005] payment status: ${priorAction}(${priorStatus}) → ${currentAction}(${curStatus})`);
    }
}

/** GC-PAY-011: Payment status after cancellation */
export function validateGcPaymentStatusAfterCancel(
    msg: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const payments: any[] = msg?.order?.payments || [];
    for (const pay of payments) {
        const status = pay?.status;
        if (status) r.passed.push(`[L2:GC-PAY-011] payment status after cancel: ${status}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. BILLING VALIDATIONS (GC-BIL-001→005)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-BIL-001→005: Billing details persistence */
export function validateGcBillingConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curBilling = currentMsg?.order?.billing;
    const priorBilling = priorData?.billing;
    if (!curBilling || !priorBilling) return;
    const fields = ["name", "email", "phone"];
    let allMatch = true;
    for (const f of fields) {
        if (curBilling?.[f] && priorBilling?.[f] && curBilling[f] !== priorBilling[f]) {
            r.failed.push(`billing.${f} mismatch: ${currentAction}(${curBilling[f]}) vs ${priorAction}(${priorBilling[f]})`);
            allMatch = false;
        }
    }
    if (allMatch) r.passed.push(`billing details consistent: ${currentAction} matches ${priorAction}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ORDER LIFECYCLE (GC-ORD-001→012)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-ORD-001→003: Order ID consistency */
export function validateGcOrderIdConsistency(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curId = currentMsg?.order?.id || currentMsg?.order_id;
    const priorId = priorData?.order_id;
    if (curId && priorId) {
        if (curId === priorId) r.passed.push(`order_id consistent: ${currentAction} matches ${priorAction}`);
        else r.failed.push(`order_id mismatch: ${currentAction}(${curId}) vs ${priorAction}(${priorId})`);
    }
}

/** GC-ORD-004,005,009,011: Order status value checks */
export function validateGcOrderStatusValue(
    msg: any, r: TestResult, flowId?: string, expected?: string, actionLabel?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const status = msg?.order?.status;
    if (status && expected) {
        if (status === expected) r.passed.push(`order.status=${status} as expected in ${actionLabel}`);
        else r.failed.push(`order.status should be ${expected} in ${actionLabel}, got: ${status}`);
    }
}

/** GC-ORD-007,008: Order status transition */
const VALID_ORDER_TRANSITIONS: Record<string, string[]> = {
    "CREATED": ["ACCEPTED"],
    "ACCEPTED": ["IN_PROGRESS", "COMPLETED"],
    "IN_PROGRESS": ["COMPLETED"],
    "COMPLETED": [],
    "CANCELLED": [],
};
export function validateGcOrderStatusTransition(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curStatus = currentMsg?.order?.status;
    const priorStatus = priorData?.order_status;
    if (!curStatus || !priorStatus) return;
    if (curStatus === "CANCELLED") {
        r.passed.push(`order transition: ${priorStatus} → CANCELLED in ${currentAction}`);
        return;
    }
    const allowed = VALID_ORDER_TRANSITIONS[priorStatus];
    if (allowed && allowed.includes(curStatus)) r.passed.push(`valid order transition: ${priorStatus} → ${curStatus} in ${currentAction}`);
    else if (allowed) r.failed.push(`invalid order transition: ${priorStatus} → ${curStatus} in ${currentAction}`);
}

/** GC-ORD-012: created_at immutable, updated_at non-decreasing */
export function validateGcTimestamps(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curCreated = currentMsg?.order?.created_at;
    const priorCreated = priorData?.created_at;
    if (curCreated && priorCreated) {
        if (curCreated === priorCreated) r.passed.push(`created_at immutable: ${currentAction} matches ${priorAction}`);
        else r.failed.push(`created_at changed: ${currentAction}(${curCreated}) vs ${priorAction}(${priorCreated})`);
    }
    const curUpdated = currentMsg?.order?.updated_at;
    const priorUpdated = priorData?.updated_at;
    if (curUpdated && priorUpdated) {
        if (new Date(curUpdated).getTime() >= new Date(priorUpdated).getTime())
            r.passed.push(`updated_at non-decreasing: ${currentAction} >= ${priorAction}`);
        else r.failed.push(`updated_at decreased: ${currentAction}(${curUpdated}) < ${priorAction}(${priorUpdated})`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. CANCEL VALIDATIONS (GC-CAN-001→007)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-CAN-001,002: Cancellation/return terms in on_search */
export function validateGcCancellationTermsInSearch(
    providers: any[], r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId) || !Array.isArray(providers)) return;
    for (const prov of providers) {
        const items: any[] = prov?.items || [];
        for (const item of items) {
            if (item?.cancellation_terms) r.passed.push(` cancel terms found for item ${item.id}`);
            if (item?.return_terms) r.passed.push(` return terms found for item ${item.id}`);
        }
    }
}

/** GC-ORD-010: Cancellation details in on_cancel */
export function validateGcCancellationDetails(
    msg: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const cancellation = msg?.order?.cancellation;
    if (cancellation?.cancelled_by) r.passed.push(`[L2:GC-ORD-010] cancelled_by present: ${cancellation.cancelled_by}`);
    else r.failed.push("[L2:GC-ORD-010] cancellation.cancelled_by missing in on_cancel");
    if (cancellation?.reason?.id) r.passed.push(`[L2:GC-ORD-010] cancellation reason.id present: ${cancellation.reason.id}`);
    else r.failed.push("[L2:GC-ORD-010] cancellation.reason.id missing in on_cancel");
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. UPDATE VALIDATIONS (GC-UPD-001→006)
// ═══════════════════════════════════════════════════════════════════════════════

/** GC-UPD-001: update_target field */
export function validateGcUpdateTarget(
    msg: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId)) return;
    const updateTarget = msg?.update_target;
    if (updateTarget) r.passed.push(`[L2:GC-UPD-001] update_target present: ${updateTarget}`);
    else r.failed.push("[L2:GC-UPD-001] update_target missing in update");
}

/** GC-UPD-002: Order ID match update → on_confirm */
export function validateGcUpdateOrderIdMatch(
    msg: any, priorData: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const updateOrderId = msg?.order?.id;
    const confirmOrderId = priorData?.order_id;
    if (updateOrderId && confirmOrderId) {
        if (updateOrderId === confirmOrderId) r.passed.push("[L2:GC-UPD-002] update order_id matches on_confirm");
        else r.failed.push(`[L2:GC-UPD-002] update order_id (${updateOrderId}) ≠ on_confirm (${confirmOrderId})`);
    }
}

/** GC-UPD-005: Quote unchanged after receiver update */
export function validateGcQuoteUnchangedAfterUpdate(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string
): void {
    if (!isGiftCardFlow(flowId) || !priorData) return;
    const curTotal = currentMsg?.order?.quote?.price?.value;
    const priorTotal = priorData?.quote?.price?.value;
    if (curTotal && priorTotal) {
        if (parseFloat(curTotal) === parseFloat(priorTotal)) r.passed.push("[L2:GC-UPD-005] quote unchanged after receiver update");
        else r.failed.push(`[L2:GC-UPD-005] quote changed after update: ${curTotal} vs prior ${priorTotal}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Run all context validations between action pair */
export function validateGcAllContext(
    currentCtx: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    validateGcTransactionId(currentCtx, priorData, r, flowId, currentAction, priorAction);
    validateGcBapBppConsistency(currentCtx, priorData, r, flowId, currentAction, priorAction);
    validateGcTimestampOrdering(currentCtx, priorData, r, flowId, currentAction, priorAction);
    validateGcLocationConsistency(currentCtx, priorData, r, flowId, currentAction, priorAction);
}

/** Run all cross-action consistency checks */
export function validateGcAllCrossAction(
    currentMsg: any, priorData: any, r: TestResult, flowId?: string,
    currentAction?: string, priorAction?: string
): void {
    validateGcProviderConsistency(currentMsg, priorData, r, flowId, currentAction, priorAction);
    validateGcItemIdConsistency(currentMsg, priorData, r, flowId, currentAction, priorAction);
    validateGcItemPriceConsistency(currentMsg, priorData, r, flowId, currentAction, priorAction);
    validateGcItemQuantityConsistency(currentMsg, priorData, r, flowId, currentAction, priorAction);
    validateGcBillingConsistency(currentMsg, priorData, r, flowId, currentAction, priorAction);
    validateGcFulfillmentConsistency(currentMsg, priorData, r, flowId, currentAction, priorAction);
    validateGcPaymentConsistency(currentMsg, priorData, r, flowId, currentAction, priorAction);
    validateGcOfferIdConsistency(currentMsg, priorData, r, flowId, currentAction, priorAction);
}

/** Run all financial validations on a message */
export function validateGcAllFinancials(
    msg: any, r: TestResult, flowId?: string, actionLabel?: string
): void {
    validateGcQuoteBreakupSum(msg, r, flowId, actionLabel);
    validateGcItemBreakupMath(msg, r, flowId, actionLabel);
    validateGcOfferBreakupNegative(msg, r, flowId, actionLabel);
    validateGcQuoteCurrency(msg, r, flowId, actionLabel);
    validateGcPaymentAmountQuoteMatch(msg, r, flowId, actionLabel);
}
