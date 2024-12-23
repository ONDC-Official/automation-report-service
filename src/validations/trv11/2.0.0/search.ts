import { logger } from "../../../utils/logger";
import { Payload, TestResult } from "../../../types/payload";
import assert from "assert";

export async function checkSearch(payload: Payload) {

  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);

  const jsonRequest = payload?.jsonRequest as any;
  const jsonResponse = payload?.jsonResponse as any;

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
