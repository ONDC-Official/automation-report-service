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

  const { jsonRequest } = payload;
  const { cancellation_reason_id } = jsonRequest;

  // Test: If technical cancellation is being made then cancellation_reason_id should be "0"
  try {
    assert.strictEqual(cancellation_reason_id, "0", "If technical cancellation, cancellation_reason_id should be '0'");
    testResults.passed.push("Cancellation reason id is correct");
  } catch (error: any) {
    testResults.failed.push(`Cancellation reason id check: ${error.message}`);
  }
  testResults.passed.push(`Validated ${action}`);
 // Apply common checks for all versions
 const commonResults = await checkCommon(payload);
 testResults.passed.push(...commonResults.passed);
 testResults.failed.push(...commonResults.failed);
  return testResults;
}