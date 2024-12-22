import assert from "assert";
import { Payload, TestResult } from "../../../types/payload";
import { logger } from "../../../utils/logger";

export async function checkOnSearch(payload: Payload): Promise<TestResult> {

  const action = payload?.jsonRequest?.context?.action;
  logger.info(`Inside ${action} validations`);
  
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  const { message } = jsonRequest;

  const providers = message.catalog.providers;

  // Use a for loop instead of forEach to ensure async works correctly
  for (const provider of providers) {
    const fulfillments = provider.fulfillments;
    // Test: Fulfillment type should be ROUTE
    try {
      assert.ok(
        fulfillments.every((fulfillment: any) => fulfillment.type === "ROUTE"),
        "Fulfillments.type should be ROUTE"
      );
      testResults.passed.push("Fulfillments.type is ROUTE");
    } catch (error: any) {
      testResults.failed.push(`Fulfillments.type is ROUTE: ${error.message}`);
    }
  }

  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  return testResults;
}