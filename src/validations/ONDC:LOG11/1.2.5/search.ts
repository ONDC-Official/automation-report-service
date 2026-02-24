import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { saveData } from "../../../utils/redisUtils";
import { DomainValidators } from "../../shared/domainValidator";

export async function checkSearch(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  // Run common domain validations first
  const commonTestResults = await DomainValidators.ondclogSearch(
    element,
    sessionID,
    flowId,
    action_id
  );

  const testResults: TestResult = {
    response: commonTestResults.response,
    passed: [...commonTestResults.passed],
    failed: [...commonTestResults.failed],
  };

  const payload = element;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations for LOG11`);

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const { context, message } = jsonRequest;
  const transactionId = context?.transaction_id;

  try {
    // Save key fields from search for cross-call comparison validations
    const fulfillment = message?.intent?.fulfillment;
    const startGps = fulfillment?.start?.location?.gps;
    const endGps = fulfillment?.end?.location?.gps;
    const startAreaCode = fulfillment?.start?.location?.address?.area_code;
    const endAreaCode = fulfillment?.end?.location?.address?.area_code;
    const categoryId = message?.intent?.category?.id;
    const paymentType = message?.intent?.payment?.type;
    const cityCode = context?.city;

    // Save pickup/delivery location for later comparison in init/on_init
    if (startGps) saveData(sessionID, transactionId, "search_start_gps", startGps);
    if (endGps) saveData(sessionID, transactionId, "search_end_gps", endGps);
    if (startAreaCode) saveData(sessionID, transactionId, "search_start_area_code", startAreaCode);
    if (endAreaCode) saveData(sessionID, transactionId, "search_end_area_code", endAreaCode);
    if (categoryId) saveData(sessionID, transactionId, "search_category_id", categoryId);
    if (paymentType) saveData(sessionID, transactionId, "search_payment_type", paymentType);
    if (cityCode) saveData(sessionID, transactionId, "search_city_code", cityCode);

    // Validate start GPS is present
    try {
      assert.ok(startGps, "message.intent.fulfillment.start.location.gps is required in search");
      testResults.passed.push("Start GPS validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate end GPS is present
    try {
      assert.ok(endGps, "message.intent.fulfillment.end.location.gps is required in search");
      testResults.passed.push("End GPS validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate city code in context
    try {
      assert.ok(cityCode, "context.city is required in search");
      testResults.passed.push("City code in context validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate category id is present
    try {
      assert.ok(categoryId, "message.intent.category.id is required in search");
      testResults.passed.push("Category ID validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}
