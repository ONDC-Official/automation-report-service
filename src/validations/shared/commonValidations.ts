import assert from "assert";
import { TestResult, Payload } from "../../types/payload";
import { logger } from "../../utils/logger";
import { validateProviderHolidays } from "./holidayChecks";
import {
  LBNPfeatureFlow,
  LSPfeatureFlow,
  rules,
  validateLBNPFeaturesForFlows,
  validateLSPFeaturesForFlows,
} from "../../utils/constants";

/**
 * Common validation setup that initializes TestResult and extracts basic payload data
 */
export function createBaseValidationSetup(payload: Payload): {
  testResults: TestResult;
  action: string;
  jsonRequest: any;
  jsonResponse: any;
  context: any;
  message: any;
} {
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);

  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const { context, message } = jsonRequest;

  return {
    testResults,
    action,
    jsonRequest,
    jsonResponse,
    context,
    message,
  };
}

/**
 * Validates provider holidays - common across all domains
 */
export function validateHolidays(
  message: any,
  context: any,
  action: string,
  testResults: TestResult
): void {
  const contextTimestamp = context?.timestamp;
  const holidays = message?.intent?.provider?.time?.schedule?.holidays;
  validateProviderHolidays(holidays, contextTimestamp, action, testResults);
}

/**
 * Validates LBNP (Logistics Buyer Network Participant) features
 */
export function validateLBNPFeatures(
  flowId: string,
  message: any,
  testResults: TestResult
): void {
  if (LBNPfeatureFlow.includes(flowId)) {
    const intentTags = message?.intent?.tags;
    const isValid = validateLBNPFeaturesForFlows(flowId, rules, intentTags);
    try {
      assert.ok(
        isValid,
        `Feature code needs to be published in the catalog/tags`
      );
      testResults.passed.push(
        `Feature code in catalog/tags validation passed`
      );
      // return testResults
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }
}

/**
 * Validates LSP (Logistics Service Provider) features
 */
export function validateLSPFeatures(
  flowId: string,
  message: any,
  testResults: TestResult
): void {
  if (LSPfeatureFlow.includes(flowId)) {
    const catalogTags = message?.catalog?.tags;
    const isValid = validateLSPFeaturesForFlows(flowId, rules, catalogTags);
    try {
      assert.ok(
        isValid,
        `Feature code needs to be published in the catalog/tags`
      );
      testResults.passed.push(
        `Feature code in catalog/tags validation passed`
      );
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }
}

/**
 * Validates prepaid payment flow
 */
export function validatePrepaidPaymentFlow(
  flowId: string,
  message: any,
  testResults: TestResult
): void {
  if (flowId === "PREPAID_PAYMENT_FLOW") {
    try {
      assert.ok(
        message?.intent?.payment?.type === "ON-ORDER",
        `Payment type should be ON-ORDER for prepaid payment flow`
      );
      testResults.passed.push(`Payment type validation passed`);
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }
}

/**
 * Validates Cash on Delivery (COD) flow
 */
export function validateCODFlow(
  flowId: string,
  message: any,
  testResults: TestResult
): void {
  if (flowId === "CASH_ON_DELIVERY_FLOW") {
    const fulfillmentTags = message?.intent?.fulfillment?.tags;
    const linkedOrderTag = fulfillmentTags?.find(
      (tag: { code: string }) => tag.code === "linked_order"
    );

    // Validate cod_order tag
    try {
      const codOrderTag = linkedOrderTag?.list?.find?.(
        (tag: { code: string; value: string }) =>
          tag.code === "cod_order" && tag.value.toLowerCase() === "yes"
      );

      assert.ok(
        codOrderTag,
        `cod_order tag with value "yes" should be present inside linked_order tag list`
      );

      testResults.passed.push(`cod_order tag validation passed`);
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate collection_amount tag
    try {
      const collectionTag = linkedOrderTag?.list?.find?.(
        (tag: { code: string; value: string }) =>
          tag.code === "collection_amount"
      );

      assert.ok(
        collectionTag,
        `collection_amount tag should be present inside linked_order tag list`
      );

      testResults.passed.push(`collection_amount tag validation passed`);
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }
}

/**
 * Validates timestamp relationships
 */
export function validateTimestampRelationship(
  earlierTimestamp: string,
  laterTimestamp: string,
  testResults: TestResult,
  validationMessage: string,
  errorMessage: string
): void {
  try {
    assert.ok(
      earlierTimestamp <= laterTimestamp,
      errorMessage
    );
    testResults.passed.push(validationMessage);
  } catch (error: any) {
    testResults.failed.push(error.message);
  }
}

/**
 * Extracts TAT (Turn Around Time) hours from ISO 8601 duration string
 */
export function extractTATHours(duration: string): number | null {
  if (!duration) return null;

  const daysMatch = duration.match(/P(\d+)D/); // Extracts days (e.g., "P4D")
  const hoursMatch = duration.match(/T(\d+)H/); // Extracts hours (e.g., "T12H")

  const days = daysMatch ? parseInt(daysMatch[1]) * 24 : 0;
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;

  return days + hours;
}

/**
 * Formats date to ISO string (YYYY-MM-DD)
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Gets timestamp from duration calculation
 */
export function getTimestampFromDuration(
  date: string | Date,
  duration: string
): Date {
  const baseDate = new Date(date);
  const hours = extractTATHours(duration);
  if (hours !== null) {
    baseDate.setHours(baseDate.getHours() + hours);
  }
  return baseDate;
}

/**
 * Validates that a required field exists
 */
export function validateRequiredField(
  value: any,
  fieldPath: string,
  testResults: TestResult,
  successMessage?: string
): boolean {
  try {
    assert.ok(value, `${fieldPath} is required`);
    if (successMessage) {
      testResults.passed.push(successMessage);
    }
    return true;
  } catch (error: any) {
    testResults.failed.push(error.message);
    return false;
  }
}

/**
 * Validates that a field matches expected value
 */
export function validateFieldValue(
  actual: any,
  expected: any,
  fieldPath: string,
  testResults: TestResult,
  successMessage?: string
): boolean {
  try {
    assert.strictEqual(actual, expected, `${fieldPath} should be ${expected}`);
    if (successMessage) {
      testResults.passed.push(successMessage);
    }
    return true;
  } catch (error: any) {
    testResults.failed.push(error.message);
    return false;
  }
}

/**
 * Validates array contains required item
 */
export function validateArrayContains(
  array: any[],
  predicate: (item: any) => boolean,
  fieldPath: string,
  testResults: TestResult,
  successMessage?: string
): boolean {
  try {
    const found = array?.find(predicate);
    assert.ok(found, `${fieldPath} should contain required item`);
    if (successMessage) {
      testResults.passed.push(successMessage);
    }
    return true;
  } catch (error: any) {
    testResults.failed.push(error.message);
    return false;
  }
}

/**
 * Adds default validation message if no validations were run
 */
export function addDefaultValidationMessage(
  testResults: TestResult,
  action: string
): void {
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated ${action}`);
  }
}

/**
 * Common search validation that combines multiple validations
 */
export function validateCommonSearch(
  payload: Payload,
  sessionID: string,
  flowId: string
): TestResult {
  const { testResults, action, context, message } = createBaseValidationSetup(payload);

  // Validate holidays
  validateHolidays(message, context, action, testResults);

  // Validate LBNP features
  validateLBNPFeatures(flowId, message, testResults);

  // Validate prepaid payment flow
  validatePrepaidPaymentFlow(flowId, message, testResults);

  // Validate COD flow
  validateCODFlow(flowId, message, testResults);

  // Add default message if no validations ran
  addDefaultValidationMessage(testResults, action);

  return testResults;
}

/**
 * Common OnSearch validation that combines multiple validations
 */
export function validateCommonOnSearch(
  payload: Payload,
  sessionID: string,
  flowId: string
): TestResult {
  const { testResults, action, context, message } = createBaseValidationSetup(payload);

  // Validate LSP features
  validateLSPFeatures(flowId, message, testResults);

  // Add default message if no validations ran
  addDefaultValidationMessage(testResults, action);

  return testResults;
}
