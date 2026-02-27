import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateQuoteBreakup, validateTermsTags, validateStops } from "./commonChecks";

export default async function on_init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11OnInit210(element, sessionID, flowId, actionId, usecaseId);

  // Metro Card flows have no transit stops and no fixed item prices
  const isCardFlow = flowId === "METRO_CARD_PURCHASE" || flowId === "METRO_CARD_RECHARGE";
  // Bus Agent flows start at select (no search step) — no txnId, no monetary quote
  const isAgentFlow = !!flowId?.toUpperCase().includes("AGENT");

  // Filter false positives for Bus Agent flows
  if (isAgentFlow && result.failed.length > 0) {
    result.failed = result.failed.filter(
      (err: string) =>
        !err.toLowerCase().includes("no transaction ids found") &&
        !err.toLowerCase().includes("quote")
    );
  }

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // Quote validation — skip for Metro Card flows (card breakup structure differs)
    if (order?.quote && !isCardFlow) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
      validateQuoteBreakup(order.quote, result, "on_init");
    }

    // Validate fulfillments with stops — skip for Metro Card flows (no transit stops)
    if (order?.fulfillments && Array.isArray(order.fulfillments) && !isCardFlow) {
      for (const f of order.fulfillments) {
        if (f.stops) {
          validateStops(f.stops, result, `on_init.fulfillment[${f.id}]`);
        }
      }
    }

    // 2.1.0: BPP_TERMS in order.tags
    if (order?.tags) {
      validateTermsTags(order.tags, result, "on_init");
    }

    // Validate payments with params
    if (order?.payments && Array.isArray(order.payments)) {
      for (const payment of order.payments) {
        if (payment.params) {
          if (payment.params.bank_code || payment.params.bank_account_number) {
            result.passed.push("on_init: payment params contain bank details");
          }
        }
      }
    }

    // Cross-check with INIT — skip for Metro Card flows (no fixed item price in init)
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId && !isCardFlow) {
      const initData = await getActionData(sessionID, flowId, txnId, "init");
      const onInitItems: any[] = order?.items || [];
      const initItems: any[] = initData?.items || [];
      const initPriceById = new Map<string, string>();
      for (const it of initItems) if (it?.id && it?.price?.value !== undefined) initPriceById.set(it.id, String(it.price.value));

      const priceMismatches: Array<{ id: string; init: string; on_init: string }> = [];
      for (const it of onInitItems) {
        const id = it?.id;
        if (!id || !initPriceById.has(id)) continue;
        const ini = parseFloat(initPriceById.get(id) as string);
        const onIni = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(ini) && !Number.isNaN(onIni)) {
          if (ini === onIni) result.passed.push(`Item '${id}' price matches INIT`);
          else priceMismatches.push({ id, init: String(ini), on_init: String(onIni) });
        }
      }
      if (priceMismatches.length) {
        result.failed.push("Item price mismatches between INIT and on_init");
        (result.response as any) = {
          ...(result.response || {}),
          on_init_vs_init: { priceMismatches },
        };
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonResponse");
  return result;
}
