import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";

export default async function search(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  console.log("result=>>>>>>>>>>>>>>>>>search", element,sessionID, flowId);
  await saveFromElement(element,sessionID,flowId, "jsonRequest");
  const result = await DomainValidators.fis11Search(element, sessionID, flowId);
  return result;
}