import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateItemPricing, validateSelectAgainstCatalog } from "./commonChecks";
import {
  validateSelectProvider,
  validateSelectItems,
  validateSelectLocationRefs,
  validateSelectFulfillmentRefs,
  validateSelectFulfillmentLocation,
  validateCustomerIdentification,
  validateCityConsistency,
  validateMinimumOrderValue,
} from "./selectChecks";

export default async function select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.retEB2BSelect(element, sessionID, flowId, actionId, usecaseId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    validateItemPricing(order?.items, result, "select");
    validateSelectProvider(order, result);
    validateSelectItems(order, result);
    validateSelectLocationRefs(order, result);
    validateSelectFulfillmentRefs(order, result);
    validateSelectFulfillmentLocation(order, result);
    validateCustomerIdentification(order, "select", result, { requireOrganizationName: true });

    const context = element?.jsonRequest?.context;
    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      const onSearchData = await getActionData(sessionID, flowId, txnId, "on_search");
      validateSelectAgainstCatalog(message, onSearchData, result);
      validateCityConsistency(context, onSearchData, result);
      validateMinimumOrderValue(order, onSearchData, result);
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
