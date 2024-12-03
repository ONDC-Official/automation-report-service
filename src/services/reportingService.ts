import { fetchPayload } from "./fetchPayload";
import { parsePayload } from "./parsePayload";
import { validateLogs } from "./validateLogs";
import { generateHtmlReport } from "./generateHtmlReport";
import { STORAGE_URL, VALIDATION_URL } from "../config/config";
import { logger } from "../utils/logger";
import { ValidationResult } from "../types/validationResult";
import { ParsedPayload } from "../types/parsedPayload"; // Ensure you have the right type imported
/**
 * Processes a list of transaction IDs, generates a combined HTML report
 * @param transactionIds Array of transaction IDs
 * @returns A single HTML report string
 */

interface TransactionFlowMapping {
  [transactionId: string]: string; // Maps transaction ID to flow name
}

/**
 * Processes a list of transaction IDs, generates a combined HTML report.
 * @param transactionFlowMappings - A mapping of transaction IDs to flow names.
 * @returns A combined HTML report as a string.
 */
export async function reportingService(
  transactionFlowMappings: TransactionFlowMapping
): Promise<string> {
  const results: ValidationResult[] = [];

  for (const [transactionId, flow] of Object.entries(transactionFlowMappings)) {
    try {
      logger.info(`Processing Transaction ID: ${transactionId}`);

      // Step 1: Fetch payload from storage
      const payload = await fetchPayload(transactionId, STORAGE_URL);
      logger.info(`Payload fetched successfully for Transaction ID: ${transactionId}`);

      // Step 2: Parse the payload into a log validation format
      const parsedPayload = parsePayload(transactionId, flow, payload);
      logger.info(`Payload parsed successfully for Transaction ID: ${transactionId}`);

      // Step 3: Validate logs using the log validation service
      const validationResult = await validateLogs(parsedPayload, VALIDATION_URL);
      logger.info(`Validation completed successfully for Transaction ID: ${transactionId}`);

      // Collect validation result for the final report
      results.push({
        transactionId,
        status: "success",
        test_case: "Payload validated successfully",
        details: validationResult,
      });
    } catch (error: any) {
      logger.error(`Failed to process Transaction ID: ${transactionId}. Error: ${(error as Error).message}`);

      // Add failed transaction details to results
      results.push({
        transactionId,
        status: "error",
        test_case: "Payload could not be validated",
        details: { message: error.message },
      });
    }
  }

  // Step 4: Generate a single combined HTML report
  const htmlReport = generateHtmlReport(results);
  logger.info("HTML report generated successfully for all transaction IDs.");

  return htmlReport; // Return the HTML report as a string
}