import { logger } from "../../../utils/logger";
import {
  JsonRequest,
  TestResult,
  WrappedPayload,
} from "../../../types/payload";
import assert from "assert";
import {
  saveData,
  fetchData,
  addTransactionId,
  getTransactionIds,
} from "../../../utils/redisUtils";

export async function checkSearch(
  element: WrappedPayload,
  sessionID: string,
  flowId: string
) {
  const payload = element?.payload;

  const action = payload?.action?.toLowerCase();

  logger.info(`Inside ${action} validations`);

  const jsonRequest = payload?.jsonRequest as JsonRequest;
  const jsonResponse = payload?.jsonResponse;
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  if (jsonResponse?.response) testResults.response = jsonResponse.response;

  const transactionId = jsonRequest.context.transaction_id;

  await addTransactionId(sessionID, flowId, transactionId);

  const transactionMap = await getTransactionIds(sessionID, flowId);

  if (transactionMap.length > 1 && transactionId === transactionMap[1]) {
    logger.info(`Validating stops for transactionId: ${transactionId}`);
    const fulfillment = jsonRequest?.message?.intent?.fulfillment;
    console.log(fulfillment);

    try {
      // Fetch fulfillment map
      const stopCodesSet = await fetchData(
        sessionID,
        transactionMap[0],
        `stopCodesSet`
      );
      console.log(stopCodesSet);

      if (!stopCodesSet) {
        logger.error("Fulfillment map is empty or not found.");
        return testResults;
      }

      // Extract stops from the JSON request
      const stops = fulfillment.stops;

      // Validate each stop's location.descriptor.code
      let allStopsValid = true; // Flag to track if all stops are valid

      // Validate each stop's location.descriptor.code
      for (const stop of stops) {
        const stopCode = stop?.location?.descriptor?.code;

        try {
          // Assert that stopCode is valid (exists in stopCodesSet)
          assert.ok(
            stopCodesSet.includes(stopCode),
            `Stop code ${stopCode} is not present in on_search_1.`
          );
        } catch (error: any) {
          testResults.failed.push(error.message);
          logger.error(error.message);
          allStopsValid = false; // Set flag to false if any stop is invalid
        }
      }

      // Only push success message if all stops are valid
      if (allStopsValid) {
        testResults.passed.push(`START AND END are valid stops`);
      }
    } catch (error: any) {
      logger.error(`Error during search_2 validation: ${error.message}`);
    }
  }

  // Log success validation for action
  logger.info(`Validated ${action}`);

  if (testResults.passed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}
