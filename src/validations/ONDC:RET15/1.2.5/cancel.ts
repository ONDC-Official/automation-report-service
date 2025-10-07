import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";

export default async function cancel(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  console.log("result=>>>>>>>>>>>>>>>>>cancel", element, sessionID, flowId);
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  const result = await DomainValidators.ret15Cancel(element, sessionID, flowId);
  return result;
}