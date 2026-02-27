import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import {
  validateInsuranceContext,
  validateInsuranceOrderStatus,
  validateInsuranceDocuments,
} from "../../shared/healthInsuranceValidations";

export default async function on_cancel(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13OnCancel(element, sessionID, flowId, actionId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Health insurance domain checks
    validateInsuranceContext(context, result, flowId);
    if (message) validateInsuranceOrderStatus(message, result, flowId);
    if (message) validateInsuranceDocuments(message, result, flowId);

    // Form ID (xinput) check
    const txnId = context?.transaction_id as string | undefined;
    if (txnId && message) {
      await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_cancel", result);
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
