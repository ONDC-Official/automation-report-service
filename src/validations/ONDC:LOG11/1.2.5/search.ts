import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import { logger } from "../../../utils/logger";
import { DomainValidators } from "../../shared/domainValidator";
import { saveData } from "../../../utils/redisUtils";

export async function checkSearch(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  return await DomainValidators.ondclogSearch(element, sessionID, flowId, action_id);
  
}
