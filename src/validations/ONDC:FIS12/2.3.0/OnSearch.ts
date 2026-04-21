import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { PURCHASE_FINANCE_FLOWS } from "../../../utils/constants";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";

export default async function on_search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12UnifiedCreditOnSearch(element, sessionID, flowId, actionId);

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}