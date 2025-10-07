import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  console.log("result=>>>>>>>>>>>>>>>>>on_confirm", element, sessionID, flowId);
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  const result = await DomainValidators.ret15OnConfirm(element, sessionID, flowId);
  return result;
}