import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData, compareSelectVsOnSearch } from "../../../services/actionDataService";
import { PURCHASE_FINANCE_FLOWS } from "../../../utils/constants";

export default async function select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  // Log all received parameters to debug 
  const result = await DomainValidators.fis12Select(element, sessionID, flowId, actionId, usecaseId);
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
      
      // Validate form ID consistency for purchase finance flows
      if (flowId && PURCHASE_FINANCE_FLOWS.includes(flowId)) {
        const selectMessage = element?.jsonRequest?.message;
        const selectItems = selectMessage?.order?.items || [];
        
        // Get form IDs from on_search
        const onSearchFormIds: string[] = [];
        if (onSearchData?.providers && Array.isArray(onSearchData.providers)) {
          for (const provider of onSearchData.providers) {
            if (provider.items && Array.isArray(provider.items)) {
              for (const item of provider.items) {
                if (item?.xinput?.form?.id) {
                  onSearchFormIds.push(item.xinput.form.id);
                }
              }
            }
          }
        }
        
        // Validate form IDs in select match on_search
        for (const item of selectItems) {
          if (item?.xinput?.form?.id) {
            const formId = item.xinput.form.id;
            if (onSearchFormIds.includes(formId)) {
              result.passed.push(`Item ${item.id}: Form ID "${formId}" matches on_search`);
            } else if (onSearchFormIds.length > 0) {
              result.failed.push(`Item ${item.id}: Form ID "${formId}" not found in on_search. Available form IDs: ${onSearchFormIds.join(", ")}`);
            }
          }
          
          // Validate form_response status
          if (item?.xinput?.form_response?.status) {
            const status = item.xinput.form_response.status;
            const allowedStatuses = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "SUCCESS"];
            if (allowedStatuses.includes(status)) {
              result.passed.push(`Item ${item.id}: Form response status "${status}" is valid`);
            } else {
              result.failed.push(`Item ${item.id}: Invalid form response status "${status}". Allowed: ${allowedStatuses.join(", ")}`);
            }
          }
        }
      }
    }
  } catch (_) {}
  await saveFromElement(element,sessionID,flowId, "jsonRequest");
  return result;
}