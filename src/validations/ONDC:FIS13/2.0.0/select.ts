import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateInsuranceContext,
  validateInsuranceSelectItems,
} from "../../shared/healthInsuranceValidations";

export default async function select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13Select(element, sessionID, flowId, actionId);

  validateInsuranceContext(element?.jsonRequest?.context, result, flowId, "2.0.0");
  validateInsuranceSelectItems(element?.jsonRequest?.message, result, flowId);
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}

