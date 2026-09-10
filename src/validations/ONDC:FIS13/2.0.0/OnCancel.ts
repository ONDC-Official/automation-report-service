import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
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

  validateInsuranceContext(element?.jsonRequest?.context, result, flowId, "2.0.0");
  validateInsuranceOrderStatus(element?.jsonRequest?.message, result, flowId);
  validateInsuranceDocuments(element?.jsonRequest?.message, result, flowId);

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}

