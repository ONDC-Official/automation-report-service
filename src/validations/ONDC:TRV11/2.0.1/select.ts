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
  try {
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const onSearchData = await getActionData(sessionID,flowId, txnId, "on_search");
      (result.response as any) = { ...(result.response || {}), on_search: onSearchData };

      const cmp = compareSelectVsOnSearch(element?.jsonRequest?.message, onSearchData);
      result.passed.push(...cmp.passed);
      result.failed.push(...cmp.failed);
      if (Object.keys(cmp.details).length) {
        (result.response as any).select_vs_on_search = cmp.details;
      }
    }
  } catch (_) {}
  await saveFromElement(element,sessionID,flowId, "jsonRequest");
  return result;
}