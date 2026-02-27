import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { saveFromElement } from "../../../utils/specLoader";
import { validateQuoteBreakup, validateStops } from "./commonChecks";

export default async function on_select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11OnSelect(element, sessionID, flowId, actionId);

  // Metro Card flows have a simplified quote and no fixed item prices in select
  const isCardFlow = flowId === "METRO_CARD_PURCHASE" || flowId === "METRO_CARD_RECHARGE";
  // Bus Agent flows start at select (no search step) — no txnId, no quantity, no quote
  const isAgentFlow = !!flowId?.toUpperCase().includes("AGENT");

  // Filter base validator false positives for Metro Card / Bus Agent flows
  if ((isCardFlow || isAgentFlow) && result.failed.length > 0) {
    result.failed = result.failed.filter(
      (err: string) =>
        !err.toLowerCase().includes("quantity.selected.count") &&
        !err.toLowerCase().includes("no transaction ids found")
    );
  }

  // Agent flows: also filter fulfillment_ids and quote errors (items are catalog stubs, no price yet)
  if (isAgentFlow && result.failed.length > 0) {
    result.failed = result.failed.filter(
      (err: string) =>
        !err.toLowerCase().includes("fulfillment_ids") &&
        !err.toLowerCase().includes("quote")
    );
  }

  try {
    const message = element?.jsonRequest?.message;

    // Quote validation — skip for Metro Card flows (simplified quote structure)
    if (message?.order?.quote && !isCardFlow) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
      // 2.1.0: validate breakup for TAX, OTHER_CHARGES
      validateQuoteBreakup(message.order.quote, result, "on_select");
    }

    // Validate fulfillments with stops
    if (message?.order?.fulfillments && Array.isArray(message.order.fulfillments)) {
      for (const f of message.order.fulfillments) {
        if (f.stops) {
          validateStops(f.stops, result, `on_select.fulfillment[${f.id}]`);
        }
      }
    }

    // Validate cancellation_terms
    if (message?.order?.cancellation_terms && Array.isArray(message.order.cancellation_terms)) {
      result.passed.push(`on_select: cancellation_terms present with ${message.order.cancellation_terms.length} entries`);
    }

    // Compare with SELECT request — skip for Metro Card flows (no fixed item price in select)
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId && !isCardFlow) {
      const selectData = await getActionData(sessionID, flowId, txnId, "select");
      const selItems: any[] = selectData?.order?.items || [];
      const onSelItems: any[] = message?.order?.items || [];

      const selectPriceById = new Map<string, string>();
      for (const it of selItems) {
        if (it?.id && it?.price?.value !== undefined) {
          selectPriceById.set(it.id, String(it.price.value));
        }
      }

      const priceMismatches: Array<{ id: string; select: string; on_select: string }> = [];
      for (const it of onSelItems) {
        const id: string | undefined = it?.id;
        if (!id || !selectPriceById.has(id)) continue;
        const selPrice = parseFloat(selectPriceById.get(id) as string);
        const onSelPrice = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(selPrice) && !Number.isNaN(onSelPrice)) {
          if (selPrice === onSelPrice) {
            result.passed.push(`Item '${id}' price matches SELECT`);
          } else {
            priceMismatches.push({ id, select: String(selPrice), on_select: String(onSelPrice) });
          }
        }
      }

      if (priceMismatches.length) {
        result.failed.push("Item price mismatches between SELECT and on_select");
        (result.response as any) = {
          ...(result.response || {}),
          on_select_vs_select: { priceMismatches },
        };
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
