import { logger } from "../../../utils/logger";
import {
  JsonRequest,
  TestResult,
  WrappedPayload,
} from "../../../types/payload";
import assert from "assert";
import { saveData, fetchData, addTransactionId } from "../../../utils/redisUtils";

export async function checkSearch(element: WrappedPayload, sessionID: string) {
  const payload = element?.payload;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);

  const jsonRequest = payload?.jsonRequest as JsonRequest;
  const jsonResponse = payload?.jsonResponse as any;

  const transactionId = jsonRequest.context.transaction_id;
  const messageId = jsonRequest.context.message_id;

  await addTransactionId(sessionID,transactionId);

  await saveData(
    sessionID,
    transactionId,
    "searchIntent",
    jsonRequest?.messgae?.intent
  );

  // Store results
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  testResults.passed.push(`Validated ${action}`);

  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  // Return the result object containing passed and failed tests
  return testResults;
}
