import assert from "assert";
import { Payload, TestResult } from "../../../types/payload";
import { logger } from "../../../utils/logger";

export async function checkSelect(payload: Payload): Promise<TestResult> {

  const action = payload?.jsonRequest?.context?.action;
  logger.info(`Inside ${action} validations`);
  
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest,jsonResponse } = payload;
  const { items } = jsonRequest;

  try {
    // Quantity.selected.count can't be greater than quantity.maximum.count
    items.forEach((item: any) => {
      assert.ok(item.quantity.selected.count <= item.quantity.maximum.count, "Quantity.selected.count can't be greater than quantity.maximum.count");
    });
    testResults.passed.push("Quantity.selected.count is not greater than quantity.maximum.count");
  } catch (error: any) {
    testResults.failed.push(`Quantity selected count check: ${error.message}`);
  }

  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  return testResults;
}