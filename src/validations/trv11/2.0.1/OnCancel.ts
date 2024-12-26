import assert from "assert";
import { Payload, TestResult, WrappedPayload } from "../../../types/payload";
import { checkCommon } from "./commonChecks";
import { logger } from "../../../utils/logger";

export async function checkOnCancel(element: WrappedPayload): Promise<TestResult> {
  const payload = element?.payload;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);
  
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest ,jsonResponse} = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;
  const { cancellation_reason_id } = jsonRequest;


 // Apply common checks for all versions
 const commonResults = await checkCommon(payload);
 testResults.passed.push(...commonResults.passed);
 testResults.failed.push(...commonResults.failed);

 if (testResults.passed.length < 1)
  testResults.passed.push(`Validated ${action}`);
  return testResults;
}