import { ApiResponse } from "../types/utilityResponse";
import axios, { AxiosError } from "axios";
import { ParsedPayload } from "../types/parsedPayload";
import { Result } from "../types/result";
import dotenv from "dotenv";
import { VALIDATION_URL } from "../utils/constants";
import logger from "@ondc/automation-logger";
dotenv.config();

export async function validateFlows(parsedFlows: {
  [flowId: string]: ParsedPayload;
}): Promise<{ flowId: string; results: Result }[]> {
  logger.info("Entering validateFlows function. Validating flows...",
    {meta: parsedFlows,
  });
  try {
    const validatedFlows = await Promise.all(
      Object.entries(parsedFlows).map(async ([flowId, parsedPayload]) => {
        const results = await validateLogs(flowId, parsedPayload);
        return { flowId, results };
      })
    );
    logger.info("Exiting validateFlows function. Validated flows.",
      {meta: {validatedFlows},
    });
    return validatedFlows;
  } catch (error) {
    logger.error("Error occurred while validating flows",
      {error,
      meta: {
        parsedFlows,
      }},
    );
    throw error;
  }
}

export async function validateLogs(
  flowId: string,
  parsedPayload: ParsedPayload
): Promise<Result> {
 
  const validationUrl =
   VALIDATION_URL[parsedPayload?.domain] ||
    "https://log-validation.ondc.org/api/validate";

  // logger.info(`Utility URL : ${validationUrl}`);
  logger.info("Utility URL: ${validationUrl}",
    {meta: { validationUrl },
  });
  try {
    const response = await axios.post<ApiResponse>(
      validationUrl,
      parsedPayload
    );

    // Wrap the successful response in a `ValidationResult`
    return { success: true, response: response.data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ApiResponse>;

      // Capture and return error details
      const statusCode = axiosError.response?.status || "Unknown status code";
      const errorDetails = axiosError.response?.data || {
        message: "No response data",
      };
      logger.error("Error occurred during validation : Axios error",
        { error: axiosError,
        meta: {
          flowId,
          statusCode,
          errorDetails,
        },
      });
      return {
        success: false,
        error: `Validation failed with status ${statusCode}`,
        details: errorDetails,
      };
    }
    logger.error("Error occurred during validation : Non-axios error",
      { error,
      meta: {
        flowId,
      }},
    );
    // Handle unexpected errors
    return {
      success: false,
      error: "Unexpected error during validation",
      details: (error as Error).message,
    };
  }
}
