import assert from "assert";
import { Payload, TestResult, WrappedPayload } from "../../../types/payload";
import { logger } from "../../../utils/logger";
import { RedisService } from "ondc-automation-cache-lib";
import { getTransactionIds } from "../../../utils/redisUtils";

export async function checkOnSearch(
  element: WrappedPayload,
  sessionID: string
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
  const { message } = jsonRequest;

  const transactionId = jsonRequest.context.transaction_id;
  const transactionMap = await getTransactionIds(sessionID);


  // console.log( await RedisService.getKey(`${uri}:search`));

  const providers = message.catalog.providers;

  // Use a for loop instead of forEach to ensure async works correctly
  for (const provider of providers) {
    const fulfillments = provider.fulfillments;
 
    
    if (transactionId === transactionMap[0]) {
      console.log(transactionId, transactionMap[0]);
      // Test: Fulfillment type should be ROUTE for on_search_1
      try {
        assert.ok(
          fulfillments.every(
            (fulfillment: any) => fulfillment.type === "ROUTE"
          ),
          "Fulfillments.type should be ROUTE"
        );
        testResults.passed.push("Fulfillments.type is ROUTE");
      } catch (error: any) {
        testResults.failed.push(`Fulfillments.type should be ROUTE: ${error.message}`);
      }
    }


    if (transactionMap.length>1 && transactionId === transactionMap[1]) {
      console.log(transactionId, transactionMap[1]);
      // Test: Fulfillment type should be TRIP for on_search_2
      try {
        assert.ok(
          fulfillments.every((fulfillment: any) => fulfillment.type === "TRIP"),
          "Fulfillments.type should be TRIP"
        );
        testResults.passed.push("Fulfillments.type is TRIP");
      } catch (error: any) {
        testResults.failed.push(`${error.message}`);
      }
    }
  }
  testResults.passed.push(`Validated ${action}`);
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  return testResults;
}
