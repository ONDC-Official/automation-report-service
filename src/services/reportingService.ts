import { fetchPayload } from "./fetchPayload";
import { parsePayload } from "./parsePayload";
import { validateLogs } from "./validateLogs";
import { generateHtmlReportByFlow } from "./generateHtmlReport";
import { STORAGE_URL, VALIDATION_URL } from "../config/config";
import { logger } from "../utils/logger";
import { ValidationResult } from "../types/validationResult";
/**
 * Processes a list of transaction IDs, generates a combined HTML report
 * @param transactionIds Array of transaction IDs
 * @returns A single HTML report string
 */

interface FlowTransactionMapping {
  [flow: string]: string[]; // Maps flow names to arrays of transaction IDs
}

export async function reportingService(
  flowTransactionMappings: FlowTransactionMapping
): Promise<string> {
  const results: { [flow: string]: ValidationResult[] } = {};

  for (const [flow, transactionIds] of Object.entries(
    flowTransactionMappings
  )) {
    try {
      logger.info(`Processing flow: ${flow}`);

      // Step 1: Fetch all payloads for the transactions in the flow
      const payloads = await Promise.all(
        transactionIds.map((transactionId) =>
          fetchPayload(transactionId, STORAGE_URL)
        )
      );
      
      logger.info(`Payloads fetched successfully for flow: ${flow}`);

      // Step 2: Parse all fetched payloads
      const parsedPayloads = payloads.map((payload, index) =>
        parsePayload(transactionIds[index], flow, payload)
      );
      
      logger.info(`Payloads parsed successfully for flow: ${flow}`);

      // Step 3: Validate logs for all parsed payloads
      const flowValidationResults = await Promise.all(
        parsedPayloads.map((parsedPayload) =>
          validateLogs(parsedPayload, VALIDATION_URL)
        )
      );

      // Collect validation results
      results[flow] = flowValidationResults.map((details, index) => ({
        transactionId: transactionIds[index],
        status: details ? "success" : "error",
        test_case: "Log validation result",
        details,
      }));

      logger.info(`Validation completed for flow: ${flow}`);
    } catch (error: any) {
      logger.error(
        `Error processing flow: ${flow}. Error: ${(error as Error).message}`
      );
      results[flow] = [
        {
          transactionId: "",
          status: "error",
          test_case: "Error processing flow",
          details: { message: error.message},
        },
      ];
    }
  }

  // Step 4: Generate a combined HTML report for all flows
  const htmlReport = generateHtmlReportByFlow(results);
  logger.info("HTML report generated successfully for all flows.");

  return htmlReport;
}
