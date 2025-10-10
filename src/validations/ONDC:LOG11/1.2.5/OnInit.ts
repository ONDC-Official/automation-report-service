import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import { logger } from "../../../utils/logger";
import { fetchData } from "../../../utils/redisUtils";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { DomainValidators } from "../../shared/domainValidator";

export async function checkOnInit(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  // First run common validations
  const commonTestResults = await DomainValidators.ondclogOnInit(
    element,
    sessionID,
    flowId
  );

  const payload = element;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);

  const testResults: TestResult = {
    response: commonTestResults.response,
    passed: [...commonTestResults.passed],
    failed: [...commonTestResults.failed],
  };

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const { message } = jsonRequest;

  // Use common quote validation function
  validateOrderQuote(message, testResults, {
    validateDecimalPlaces: true,
    validateTaxPresence: true,
    validateTotalMatch: true,
    validateCODBreakup: true,
    flowId: flowId,
  });
  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}
