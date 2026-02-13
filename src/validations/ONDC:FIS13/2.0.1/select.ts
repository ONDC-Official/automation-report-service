import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { HEALTH_INSURANCE_FLOWS } from "../../../utils/constants";
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
  const isHealthInsurance = !!flowId && HEALTH_INSURANCE_FLOWS.includes(flowId);

  // Skip DomainValidators (required + enum) for Health Insurance flows
  const result: TestResult = isHealthInsurance
    ? { response: {}, passed: [], failed: [] }
    : await DomainValidators.fis13Select(element, sessionID, flowId, actionId);

  const context = element?.jsonRequest?.context;
  const message = element?.jsonRequest?.message;

  // Skip required/enum validations for Health Insurance
  if (!isHealthInsurance) {
    validateInsuranceContext(context, result, flowId);

    if (message) {
      validateInsuranceSelectItems(message, result, flowId);
    }
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
