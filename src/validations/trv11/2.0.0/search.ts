import { logger } from "../../../utils/logger";
import {
  JsonRequest,
  Payload,
  TestResult,
  WrappedPayload,
} from "../../../types/payload";
import assert from "assert";
import { RedisService } from "ondc-automation-cache-lib";

export async function checkSearch(element: WrappedPayload) {
  const payload = element?.payload;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);


  const jsonRequest = payload?.jsonRequest as any;
  const jsonResponse = payload?.jsonResponse as any;
  const uri = jsonRequest?.context?.bap_uri;
  // Store results
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };
  RedisService.setKey(
    `${uri}:search`,
    JSON.stringify(payload.jsonRequest),
    3600
  );
  testResults.passed.push(`Validated ${action}`);
 

  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  // Return the result object containing passed and failed tests
  return testResults;
}
