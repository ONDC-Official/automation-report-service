import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateGcAllContext, validateGcMessageIdMatch,
  validateGcParentItemHierarchy, validateGcCancellationTermsInSearch,
} from "../../shared/giftCardL2Validations";

export default async function on_search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis10OnSearch(element, sessionID, flowId, actionId);

  try {
    const ctx = element?.jsonRequest?.context;
    const txnId = ctx?.transaction_id as string | undefined;
    if (txnId) {
      const searchData = await getActionData(sessionID, flowId, txnId, "search");
      // GC-CTX-001,007,015,016,018,019
      validateGcAllContext(ctx, searchData, result, flowId, "on_search", "search");
      validateGcMessageIdMatch(ctx, searchData, result, flowId, "on_search", "search");
    }
    // GC-ITEM-017: PARENT/ITEM hierarchy
    const providers: any[] = element?.jsonRequest?.message?.catalog?.providers || [];
    // validateGcParentItemHierarchy(providers, result, flowId);
    // GC-CAN-001,002: cancellation/return terms
    validateGcCancellationTermsInSearch(providers, result, flowId);
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}