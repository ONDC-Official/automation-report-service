import assert from "assert";
import { Payload, TestResult, WrappedPayload } from "../../../types/payload";
import { logger } from "../../../utils/logger";
import { RedisService } from "ondc-automation-cache-lib";

export async function checkOnSearch(element: WrappedPayload): Promise<TestResult> {
  const payload = element?.payload;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);
  
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  const { message } = jsonRequest;
  const uri= jsonRequest?.context?.bap_uri
  
// console.log( await RedisService.getKey(`${uri}:search`));

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
  testResults.passed.push(`Validated ${action}`);
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  return testResults;
}