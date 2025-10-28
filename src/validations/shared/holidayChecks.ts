import assert from "assert";
import { TestResult } from "../../types/payload";
import logger from "@ondc/automation-logger";
import { compareDates } from "../../utils/constants";

export function validateProviderHolidays(
  holidays: any,
  contextTimestamp: string | Date | undefined,
  action: string,
  testResults: TestResult
) {
  if (!contextTimestamp) {
    return; // nothing to validate against
  }
  try {
    assert.ok(
      Array.isArray(holidays) && holidays.length > 0
        ? holidays.every((holiday: string | number | Date) => {
            const holidayDate = new Date(holiday);
            return compareDates(holidayDate, contextTimestamp);
          })
        : true,
      "provider/holidays should not be past dated"
    );
    testResults.passed.push("provider/holidays date check validation passed");
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(`${error.message}`);
  }
}


