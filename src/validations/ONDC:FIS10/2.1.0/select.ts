import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData, compareSelectVsOnSearch } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdUniqueness,
  validateGcProviderConsistency, validateGcItemIdConsistency,
  validateGcOfferIdConsistency,
} from "../../shared/giftCardL2Validations";

export default async function select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10Select(element, sessionID, flowId, actionId, usecaseId);

  try {
    const ctx = element?.jsonRequest?.context;
    const msg = element?.jsonRequest?.message;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const onSearchData = await getActionData(sessionID, flowId, txnId, "on_search");
      (result.response as any) = { ...(result.response || {}), on_search: onSearchData };

      // Existing select vs on_search comparison
      const cmp = compareSelectVsOnSearch(msg, onSearchData);
      result.passed.push(...cmp.passed);
      result.failed.push(...cmp.failed);
      if (Object.keys(cmp.details).length) {
        (result.response as any).select_vs_on_search = cmp.details;
      }

      // L2: GC-CTX-012,018 (context checks vs on_search)
      validateGcAllContext(ctx, onSearchData, result, flowId, "select", "on_search");
      validateGcMessageIdUniqueness(ctx, onSearchData, result, flowId, "select", "on_search");
      // GC-PROV-001, GC-ITEM-001, GC-OFR-001
      validateGcProviderConsistency(msg, onSearchData, result, flowId, "select", "on_search");
      validateGcItemIdConsistency(msg, onSearchData, result, flowId, "select", "on_search");
      validateGcOfferIdConsistency(msg, onSearchData, result, flowId, "select", "on_search");
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}