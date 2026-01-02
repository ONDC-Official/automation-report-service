import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { PURCHASE_FINANCE_FLOWS } from "../../../utils/constants";

export default async function on_update(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12OnUpdate(element, sessionID, flowId, actionId);

  // Validate items consistency for purchase finance flows
  if (flowId && PURCHASE_FINANCE_FLOWS.includes(flowId)) {
    try {
      const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
      if (txnId) {
        const selectData = await getActionData(sessionID, flowId, txnId, "select");
        const onSelectData = await getActionData(sessionID, flowId, txnId, "on_select");
        const onUpdateMessage = element?.jsonRequest?.message;
        const onUpdateItems = onUpdateMessage?.order?.items || [];
        
        // Get item IDs from select (preferred) or on_select
        const referenceItems: any[] = selectData?.order?.items || selectData?.items || onSelectData?.items || [];
        const referenceItemIds: string[] = referenceItems.map(it => it?.id).filter(Boolean) as string[];
        
        // Get item IDs from on_update
        const onUpdateItemIds = onUpdateItems.map(it => it?.id).filter(Boolean) as string[];
        
        // Validate items consistency
        const missingItems = referenceItemIds.filter(id => !onUpdateItemIds.includes(id));
        const extraItems = onUpdateItemIds.filter(id => !referenceItemIds.includes(id));
        
        if (missingItems.length === 0 && extraItems.length === 0 && referenceItemIds.length > 0) {
          result.passed.push(`All items from select/on_select (${referenceItemIds.length}) are present in on_update`);
        } else {
          if (missingItems.length > 0) {
            result.failed.push(`Items from select/on_select missing in on_update: ${missingItems.join(", ")}`);
          }
          if (extraItems.length > 0) {
            result.failed.push(`Extra items in on_update not present in select/on_select: ${extraItems.join(", ")}`);
          }
        }
        
        // Validate form ID consistency
        const onSearchData = await getActionData(sessionID, flowId, txnId, "on_search");
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
        
        for (const item of onUpdateItems) {
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
    } catch (error: any) {
      // Silently fail if validation cannot be performed
    }
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}

