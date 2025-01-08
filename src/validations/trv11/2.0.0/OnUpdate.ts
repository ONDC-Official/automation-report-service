import assert from "assert";
import { TestResult, WrappedPayload } from "../../../types/payload";
import { checkCommon } from "./commonChecks";
import { logger } from "../../../utils/logger";
import { updateApiMap } from "../../../utils/redisUtils";

export async function checkOnUpdate(
  element: WrappedPayload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  const payload = element?.payload;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);

  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const transactionId = jsonRequest.context?.transaction_id;
  await updateApiMap(sessionID, transactionId, action);
  const { fulfillments, message } = jsonRequest;

  // Apply common checks for all versions
  const commonResults = await checkCommon(payload, sessionID, flowId);
  testResults.passed.push(...commonResults.passed);
  testResults.failed.push(...commonResults.failed);

  if (testResults.passed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}
