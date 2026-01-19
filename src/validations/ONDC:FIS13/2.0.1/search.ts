import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { HEALTH_INSURANCE_FLOWS } from "../../../utils/constants";

export default async function search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13Search(element, sessionID, flowId, actionId);
  
  // Validate form ID consistency if xinput is present
  try {
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    const message = element?.jsonRequest?.message;
    if (txnId && message && flowId && HEALTH_INSURANCE_FLOWS.includes(flowId)) {
      await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "search", result, HEALTH_INSURANCE_FLOWS);
    }
  } catch (_) {}
  
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}

