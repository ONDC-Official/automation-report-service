import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData, compareSelectVsOnSearch } from "../../../services/actionDataService";

export default async function select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11Select(element, sessionID, flowId, actionId, usecaseId);

  // Metro Card flows do not have a journey on_search catalog — skip cross-check
  const isCardFlow = flowId === "METRO_CARD_PURCHASE" || flowId === "METRO_CARD_RECHARGE";

  // Filter base validator false positives for Metro Card flows
  // (card items don't carry quantity.selected.count)
  if (isCardFlow && result.failed.length > 0) {
    result.failed = result.failed.filter(
      (err: string) => !err.toLowerCase().includes("quantity.selected.count")
    );
  }

  try {
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId && !isCardFlow) {
      const onSearchData = await getActionData(sessionID, flowId, txnId, "on_search");
      (result.response as any) = { ...(result.response || {}), on_search: onSearchData };

      const cmp = compareSelectVsOnSearch(element?.jsonRequest?.message, onSearchData);
      result.passed.push(...cmp.passed);
      result.failed.push(...cmp.failed);
      if (Object.keys(cmp.details).length) {
        (result.response as any).select_vs_on_search = cmp.details;
      }
    }

    // 2.1.0 specific: validate item quantity (not applicable for Metro Card flows)
    if (!isCardFlow) {
      const message = element?.jsonRequest?.message;
      const items = message?.order?.items;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (item?.quantity?.selected?.count) {
            const count = parseInt(item.quantity.selected.count);
            if (count > 0) {
              result.passed.push(`select: item ${item.id} quantity ${count} is valid`);
            } else {
              result.failed.push(`select: item ${item.id} quantity must be > 0`);
            }
          }
        }
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
