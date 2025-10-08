import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { ValidationAction } from "../../../types/actions";

export default async function on_search(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis11OnSearch(element, sessionID, flowId);
  await saveFromElement(element,sessionID,flowId, "jsonRequest");
  return result;
}