import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import {
  validateInsuranceContext,
  validateInsuranceSelectItems,
} from "../../shared/healthInsuranceValidations";
import {
  validateProviderConsistency,
  validateAllContext,
} from "../../shared/healthInsuranceL2Validations";

export default async function select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13Select(element, sessionID, flowId, actionId);

  const context = element?.jsonRequest?.context;
  const message = element?.jsonRequest?.message;

  // Health insurance context validation
  validateInsuranceContext(context, result, flowId);

  // Health insurance select items validation (parent_item_id, xinput form_response)
  if (message) {
    validateInsuranceSelectItems(message, result, flowId);
  }

  // ── L2: Cross-action consistency vs on_search ──
  try {
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const onSearchData = await getActionData(sessionID, flowId, txnId, "on_search");
      if (onSearchData) {
        // Provider in select must exist in on_search
        const selectProviderId = message?.order?.provider?.id;
        if (selectProviderId && onSearchData.providers) {
          const providers = Array.isArray(onSearchData.providers) ? onSearchData.providers : [onSearchData.providers];
          const providerIds = providers.map((p: any) => p?.id).filter(Boolean);
          if (providerIds.includes(selectProviderId)) {
            result.passed.push(`[L2:provider] Provider "${selectProviderId}" exists in on_search catalog`);
          } else {
            result.failed.push(`[L2:provider] Provider "${selectProviderId}" NOT found in on_search catalog`);
          }
        }
        validateAllContext(context, onSearchData, result, flowId, "select", "on_search");
      }
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
