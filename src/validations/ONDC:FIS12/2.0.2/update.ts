import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";

export default async function update(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12Update(
    element,
    sessionID,
    flowId,
    actionId
  );

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}


