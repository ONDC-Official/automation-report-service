import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";

export default async function on_init(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis11OnInit(element, sessionID, flowId);

  try {
    const message = element?.jsonRequest?.message;
    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: true,
        flowId,
      });
    }

    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const initData = await getActionData(sessionID,flowId, txnId, "init");
      // Compare item ids and prices w.r.t INIT request
      const onInitItems: any[] = message?.order?.items || [];
      const initItems: any[] = initData?.items || [];
      const initPriceById = new Map<string, string>();
      for (const it of initItems) if (it?.id && it?.price?.value !== undefined) initPriceById.set(it.id, String(it.price.value));

      const missingFromInit: string[] = [];
      const priceMismatches: Array<{ id: string; init: string; on_init: string }> = [];
      for (const it of onInitItems) {
        const id = it?.id;
        if (!id) continue;
        if (!initPriceById.has(id)) {
          missingFromInit.push(id);
          continue;
        }
        const ini = parseFloat(initPriceById.get(id) as string);
        const onIni = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(ini) && !Number.isNaN(onIni)) {
          if (ini === onIni) result.passed.push(`Item '${id}' price matches INIT`);
          else priceMismatches.push({ id, init: String(ini), on_init: String(onIni) });
        }
      }
      if (missingFromInit.length) result.failed.push("Some on_init items not present in INIT");
      if (priceMismatches.length) result.failed.push("Item price mismatches between INIT and on_init");
      if (missingFromInit.length || priceMismatches.length) {
        (result.response as any) = {
          ...(result.response || {}),
          on_init_vs_init: { missingFromInit, priceMismatches },
        };
      }
    }
  } catch (_) {}

  await saveFromElement(element,sessionID,flowId, "jsonResponse");
  return result;
}