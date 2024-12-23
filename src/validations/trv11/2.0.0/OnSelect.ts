import assert from "assert";
import { Payload, TestResult, WrappedPayload } from "../../../types/payload";
import { logger } from "../../../utils/logger";

export async function checkOnSelect(element: WrappedPayload): Promise<TestResult> {
  const payload = element?.payload;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);

  
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  const {  message } = jsonRequest;
  const items = message?.order?.items;
  // Test: Quantity.selected.count can't be greater than quantity.maximum.count (sent in items for selected items in on_search_2)
  try {
    items.forEach((item: any) => {
      assert.ok(
        item.quantity.selected.count <= item.quantity.maximum.count,
        "Quantity.selected.count can't be greater than quantity.maximum.count"
      );
    });
    testResults.passed.push(
      "Quantity.selected.count is not greater than quantity.maximum.count"
    );
  } catch (error: any) {
    logger.error(error.message);
    if (error instanceof assert.AssertionError) {
      // Push AssertionError to the array
      testResults.failed.push(
        `Quantity selected count check: ${error.message}`
      );
    }
  }
  testResults.passed.push(`Validated ${action}`);
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  return testResults;
}
