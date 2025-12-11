import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import { fetchData } from "../../../utils/redisUtils";
import { DomainValidators } from "../../shared/domainValidator";
import { deepCompareObjects } from "../../shared";

export async function checkOnConfirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id:string
): Promise<TestResult> {
  return await DomainValidators.ondclogOnConfirm(element, sessionID, flowId,action_id)
}