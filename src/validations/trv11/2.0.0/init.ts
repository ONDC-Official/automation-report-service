import assert from "assert";
import { Payload, TestResult } from "../../../types/payload";
import { checkCommon } from "./commonChecks";
import { logger } from "../../../utils/logger";

export async function checkInit(payload: Payload): Promise<TestResult> {

  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);
  
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest,jsonResponse } = payload;
  const { fulfillments, message } = jsonRequest;

  // Test: Fulfillments array length should be proportional to selected count where each fulfillment obj will refer to an individual TICKET
  try {
    const selectedCount = message.selected_count;
    assert.strictEqual(fulfillments.length, selectedCount, "Fulfillments array length should be proportional to selected count");
    testResults.passed.push("Fulfillments array length is proportional to selected count");
  } catch (error: any) {
    testResults.failed.push(`Fulfillments array length check: ${error.message}`);
  }
  testResults.passed.push(`Validated ${action}`);
  // Apply common checks for all versions
  const commonResults = await checkCommon(payload);
  testResults.passed.push(...commonResults.passed);
  testResults.failed.push(...commonResults.failed);
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  return testResults;
}