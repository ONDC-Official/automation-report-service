import { TestResult, WrappedPayload } from "../../../types/payload";
import { logger } from "../../../utils/logger";
import { getTransactionIds, saveData } from "../../../utils/redisUtils";
import assert from "assert";

export async function checkOnSearch(
  element: WrappedPayload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  const payload = element?.payload;
  if (!payload) {
    logger.error("Payload is missing");
    return { response: {}, passed: [], failed: ["Payload is missing"] };
  }

  const action = payload?.action?.toLowerCase();
  logger.info(`Inside ${action} validations`);

  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const { message } = jsonRequest;
  const transactionId = jsonRequest.context?.transaction_id;

  const transactionMap = await getTransactionIds(sessionID, flowId);

  const providers = message.catalog?.providers || [];
  const fulfillmentMap = new Map();

  // Iterate over providers
  for (const provider of providers) {
    const fulfillments = provider.fulfillments || [];
    const items = provider.items || [];

    // Check for on_search_1
    if (transactionId === transactionMap[0]) {
      logger.info("Validating fulfillments for on_search_1");

      try {
        assert.ok(
          fulfillments.every(
            (fulfillment: any) => fulfillment.type === "ROUTE"
          ),
          "Fulfillments.type should be ROUTE"
        );
        testResults.passed.push("Fulfillments.type is ROUTE");

        // Populate fulfillment map
        for (const fulfillment of fulfillments) {
          if (fulfillment.stops) {
            const stopCodesSet = new Set(
              fulfillment.stops.map(
                (stop: any) => stop.location?.descriptor?.code
              )
            );
            // Convert the Set back to an array to store the unique codes
            const uniqueStopCodes = Array.from(stopCodesSet);

            await saveData(
              sessionID,
              transactionId,
              `stopCodesSet`,
              uniqueStopCodes
            );
          }
        }
      } catch (error: any) {
        logger.error(`Error during on_search_1 validation: ${error.message}`);
        testResults.failed.push(`${error.message}`);
      }
    }

    // Check for on_search_2
    if (transactionMap.length > 1 && transactionId === transactionMap[1]) {
      logger.info("Validating fulfillments for on_search_2");

      try {
        assert.ok(
          fulfillments.every((fulfillment: any) => fulfillment.type === "TRIP"),
          "Fulfillments.type should be TRIP"
        );
        testResults.passed.push("Fulfillments.type is TRIP");
      } catch (error: any) {
        logger.error(`Error during on_search_2 validation: ${error.message}`);
        testResults.failed.push(`${error.message}`);
      }
    }

    logger.info("Validating items for on_search_2");
    try {
      await saveData(sessionID, transactionId, "onSearchItemArr", {value:items});
    } catch (error) {
      logger.error(error)
    }
    try {
      assert.ok(
        items.every(
          (item: any) =>
            item?.quantity?.minimum?.count < item?.quantity?.maximum?.count,
          "Quantity.minimum.count can't be greater than quantity.maximum.count at items."
        )
      );
      testResults.passed.push("Valid items/quantity maximum and minimum count");
    } catch (error: any) {
      logger.error(`Error during on_search_2 validation: ${error.message}`);
      testResults.failed.push(`${error.message}`);
    }
  }

  if (testResults.passed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}
