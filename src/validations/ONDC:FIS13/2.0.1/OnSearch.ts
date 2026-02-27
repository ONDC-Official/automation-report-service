import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import {
  validateInsuranceContext,
  validateInsuranceItemsOnSearch,
} from "../../shared/healthInsuranceValidations";

export default async function on_search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13OnSearch(element, sessionID, flowId, actionId);

  const context = element?.jsonRequest?.context;
  const onSearchMessage = element?.jsonRequest?.message;

  // Health insurance context validation
  validateInsuranceContext(context, result, flowId);

  // Health insurance on_search items validation
  if (onSearchMessage) {
    validateInsuranceItemsOnSearch(onSearchMessage, result, flowId);
  }

  try {
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const searchData = await getActionData(sessionID, flowId, txnId, "search");

      // Item ID consistency: search → on_search
      const searchItemIds: string[] = searchData?.items || [];
      const onSearchItemIds: string[] = [];
      if (onSearchMessage?.catalog?.providers) {
        for (const provider of onSearchMessage.catalog.providers) {
          if (provider.items && Array.isArray(provider.items)) {
            for (const item of provider.items) {
              if (item?.id) onSearchItemIds.push(item.id);
            }
          }
        }
      }
      const missingItems = searchItemIds.filter(id => !onSearchItemIds.includes(id));
      if (searchItemIds.length > 0) {
        if (missingItems.length === 0) {
          result.passed.push(`All items from search (${searchItemIds.length}) are present in on_search`);
        } else {
          result.failed.push(`Items from search missing in on_search: ${missingItems.join(", ")}`);
        }
      }

      // Form ID (xinput) check
      await validateFormIdIfXinputPresent(onSearchMessage, sessionID, flowId, txnId, "on_search", result);
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
