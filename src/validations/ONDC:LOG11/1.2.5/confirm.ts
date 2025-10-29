import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import { logger } from "../../../utils/logger";
import { fetchData } from "../../../utils/redisUtils";
import { DomainValidators } from "../../shared/domainValidator";
import { deepCompareObjects } from "../../shared";

export async function checkConfirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  return await DomainValidators.ondclogConfirm(element, sessionID, flowId,action_id,);
}
