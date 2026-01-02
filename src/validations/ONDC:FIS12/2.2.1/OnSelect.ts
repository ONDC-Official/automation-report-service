import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { saveFromElement } from "../../../utils/specLoader";
import { PURCHASE_FINANCE_FLOWS } from "../../../utils/constants";

export default async function on_select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12OnSelect(element, sessionID, flowId, actionId, usecaseId);

  try {
    const message = element?.jsonRequest?.message;
    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        // For TRV10, item price consistency is optional
        validateItemPriceConsistency: false,
        flowId,
      });
    }

    // Compare item ids and prices with prior SELECT request if available
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const selectData = await getActionData(sessionID,flowId, txnId, "select");
      const selItems: any[] = selectData?.order?.items || selectData?.items || [];
      const onSelItems: any[] = message?.order?.items || [];

      // Build price map from SELECT
      const selectPriceById = new Map<string, string>();
      const selectItemIds: string[] = [];
      for (const it of selItems) {
        if (it?.id) {
          selectItemIds.push(it.id);
          if (it?.price?.value !== undefined) {
            selectPriceById.set(it.id, String(it.price.value));
          }
        }
      }

      // Validate items consistency for purchase finance flows
      if (flowId && PURCHASE_FINANCE_FLOWS.includes(flowId)) {
        const onSelectItemIds = onSelItems.map(it => it?.id).filter(Boolean) as string[];
        const missingItems = selectItemIds.filter(id => !onSelectItemIds.includes(id));
        const extraItems = onSelectItemIds.filter(id => !selectItemIds.includes(id));
        
        if (missingItems.length === 0 && extraItems.length === 0 && selectItemIds.length > 0) {
          result.passed.push(`All items from select (${selectItemIds.length}) are present in on_select`);
        } else {
          if (missingItems.length > 0) {
            result.failed.push(`Items from select missing in on_select: ${missingItems.join(", ")}`);
          }
          if (extraItems.length > 0) {
            result.failed.push(`Extra items in on_select not present in select: ${extraItems.join(", ")}`);
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
        
        for (const item of onSelItems) {
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

      const missingInSelect: string[] = [];
      const priceMismatches: Array<{ id: string; select: string; on_select: string }> = [];
      for (const it of onSelItems) {
        const id: string | undefined = it?.id;
        if (!id) continue;
        if (!selectPriceById.has(id)) {
          missingInSelect.push(id);
          continue;
        }
        const selPrice = parseFloat(selectPriceById.get(id) as string);
        const onSelPrice = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(selPrice) && !Number.isNaN(onSelPrice)) {
          if (selPrice === onSelPrice) {
            result.passed.push(`Item '${id}' price matches SELECT`);
          } else {
            priceMismatches.push({ id, select: String(selPrice), on_select: String(onSelPrice) });
          }
        }
      }

      if (priceMismatches.length) {
        result.failed.push("Item price mismatches between SELECT and on_select");
        (result.response as any) = {
          ...(result.response || {}),
          on_select_vs_select: {
            ...(result.response as any)?.on_select_vs_select,
            priceMismatches,
          },
        };
      }
    }
  } catch (_) {}
  await saveFromElement(element,sessionID,flowId, "jsonRequest");
  return result;
}