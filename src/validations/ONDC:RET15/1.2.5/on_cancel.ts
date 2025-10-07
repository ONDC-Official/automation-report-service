import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";

export default async function on_cancel(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  console.log("result=>>>>>>>>>>>>>>>>>on_cancel", element, sessionID, flowId);
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  const result = await DomainValidators.ret15OnCancel(element, sessionID, flowId);
  return result;
}