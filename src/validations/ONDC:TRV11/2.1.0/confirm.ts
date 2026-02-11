import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateTermsTags } from "./commonChecks";

export default async function confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11Confirm210(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    // Validate payment params (transaction_id, amount)
    if (order?.payments && Array.isArray(order.payments)) {
      for (const payment of order.payments) {
        if (payment.params?.transaction_id) {
          result.passed.push("confirm: payment.params.transaction_id present");
        }
        if (payment.params?.amount) {
          result.passed.push("confirm: payment.params.amount present");
        }
        if (payment.status) {
          if (["PAID", "NOT-PAID"].includes(payment.status)) {
            result.passed.push(`confirm: payment.status '${payment.status}' is valid`);
          } else {
            result.failed.push(`confirm: payment.status '${payment.status}' is invalid`);
          }
        }
      }
    }

    // 2.1.0: BAP_TERMS in order.tags
    if (order?.tags) {
      validateTermsTags(order.tags, result, "confirm");
    }

    // Cross-check with ON_INIT
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const onInitData = await getActionData(sessionID, flowId, txnId, "on_init");
      const confirmItems: any[] = order?.items || [];
      const onInitBreakup: any[] = onInitData?.quote_breakup || [];

      const onInitPriceById = new Map<string, string>();
      for (const b of onInitBreakup) {
        const id = b?.["@ondc/org/item_id"] || b?.item?.id;
        const val = b?.price?.value ?? b?.item?.price?.value;
        if (id && val !== undefined) onInitPriceById.set(String(id), String(val));
      }
      if (onInitPriceById.size === 0) {
        const onInitItems: any[] = onInitData?.items || [];
        for (const it of onInitItems) if (it?.id && it?.price?.value !== undefined) onInitPriceById.set(it.id, String(it.price.value));
      }

      const priceMismatches: Array<{ id: string; on_init: string; confirm: string }> = [];
      for (const it of confirmItems) {
        const id = it?.id;
        if (!id || !onInitPriceById.has(id)) continue;
        const ini = parseFloat(onInitPriceById.get(id) as string);
        const cnf = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(ini) && !Number.isNaN(cnf)) {
          if (ini === cnf) result.passed.push(`Item '${id}' price matches ON_INIT`);
          else priceMismatches.push({ id, on_init: String(ini), confirm: String(cnf) });
        }
      }
      if (priceMismatches.length) {
        result.failed.push("Item price mismatches between ON_INIT and confirm");
        (result.response as any) = {
          ...(result.response || {}),
          confirm_vs_on_init: { priceMismatches },
        };
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
