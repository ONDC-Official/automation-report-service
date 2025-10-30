import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";

export default async function init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  // Fixed: Pass correct number of arguments to fis11Init (added missing 4th argument: "init")
  const result = await DomainValidators.fis11Init(element, sessionID, flowId, actionId);

  try {
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const selectData = await getActionData(sessionID,flowId, txnId, "select");
      const initMsg = element?.jsonRequest?.message;

      // Basic consistency checks w.r.t. SELECT
      const initProviderId = initMsg?.order?.provider?.id;
      const selectProviderId = selectData?.provider?.id;
      if (initProviderId && selectProviderId && initProviderId === selectProviderId) {
        result.passed.push("Provider id matches SELECT");
      } else {
        result.failed.push("Provider id mismatch with SELECT");
      }

      const initItems: any[] = initMsg?.order?.items || [];
      const selectItems: any[] = selectData?.items || [];
      const selectPriceById = new Map<string, string>();
      for (const it of selectItems) if (it?.id && it?.price?.value !== undefined) selectPriceById.set(it.id, String(it.price.value));

      const missingFromSelect: string[] = [];
      const priceMismatches: Array<{ id: string; select: string; init: string }> = [];
      for (const it of initItems) {
        const id = it?.id;
        if (!id) continue;
        if (!selectPriceById.has(id)) {
          missingFromSelect.push(id);
          continue;
        }
        const sel = parseFloat(selectPriceById.get(id) as string);
        const ini = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(sel) && !Number.isNaN(ini)) {
          if (sel === ini) result.passed.push(`Item '${id}' price matches SELECT`);
          else priceMismatches.push({ id, select: String(sel), init: String(ini) });
        }
      }
      if (priceMismatches.length) result.failed.push("Item price mismatches between SELECT and init");
      if (missingFromSelect.length || priceMismatches.length) {
        (result.response as any) = {
          ...(result.response || {}),
          init_vs_select: { missingFromSelect, priceMismatches },
        };
      }
    }
  } catch (_) {}

  await saveFromElement(element,sessionID,flowId, "jsonRequest");
  return result;
}