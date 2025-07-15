import { ApiResponse } from "../types/utilityResponse";
import axios, { AxiosError } from "axios";
import { ParsedPayload } from "../types/parsedPayload";
import { Result } from "../types/result";
import dotenv from "dotenv";
import { VALIDATION_URL } from "../utils/constants";
import { logError, logger, logInfo } from "../utils/logger";
dotenv.config();

export async function validateFlows(parsedFlows: {
  [flowId: string]: ParsedPayload;
}): Promise<{ flowId: string; results: Result }[]> {
  try {
    const validatedFlows = await Promise.all(
      Object.entries(parsedFlows).map(async ([flowId, parsedPayload]) => {
        const results = await validateLogs(flowId, parsedPayload);
        return { flowId, results };
      })
    );
    return validatedFlows;
  } catch (error) {
    // console.error("Error occurred while validating flows:", error);
    logError({
      message: "Error occurred while validating flows",
      error,
    });
    throw error;
  }
}

// Helper function to construct IDs
function constructIds(
  domain: string,
  version: string,
  originalPayloads?: Array<{ key: string, jsonRequest: any }>,
  sessionDetails?: any
): { bap_id: string; bpp_id: string } {
  const DEFAULT_BAP_ID = "<BUYER_APP_SUBSCRIBER_ID>";
  const DEFAULT_BPP_ID = "<SELLER_APP_SUBSCRIBER_ID>";
  const baseUrl = process.env.RETAIL_API_SERVICE_BASE_URL || "https://dev-automation.ondc.org/api-service";
  const retailDomains = [
    "ONDC:RET10", "ONDC:RET11", "ONDC:RET12", "ONDC:RET13", "ONDC:RET14", 
    "ONDC:RET15", "ONDC:RET16", "ONDC:RET17", "ONDC:RET18"
  ];
  
  let bap_id = DEFAULT_BAP_ID;
  let bpp_id = DEFAULT_BPP_ID;
  
  // First try to get IDs from payloads
  if (originalPayloads && originalPayloads.length > 0) {
    const ctx = originalPayloads[0].jsonRequest?.context;
    if (ctx?.bap_id) bap_id = ctx.bap_id;
    if (ctx?.bpp_id) bpp_id = ctx.bpp_id;
  }
  
  // Use session details to set IDs based on npType
  if (sessionDetails?.npType && sessionDetails?.npId) {
    if (sessionDetails.npType === 'BAP') {
      bap_id = sessionDetails.npId;
      if (!bpp_id || bpp_id === DEFAULT_BPP_ID) {
        bpp_id = `${baseUrl}/${domain}/${version}/seller`;
      }
    } else if (sessionDetails.npType === 'BPP') {
      bpp_id = sessionDetails.npId;
      if (!bap_id || bap_id === DEFAULT_BAP_ID) {
        bap_id = `${baseUrl}/${domain}/${version}/buyer`;
      }
    }
  }
  
  // Retail domain fallback logic
  if (retailDomains.includes(domain)) {
    if ((!bap_id || bap_id === DEFAULT_BAP_ID) && bpp_id && bpp_id !== DEFAULT_BPP_ID) {
      bap_id = `${baseUrl}/${domain}/${version}/buyer`;
    }
    if ((!bpp_id || bpp_id === DEFAULT_BPP_ID) && bap_id && bap_id !== DEFAULT_BAP_ID) {
      bpp_id = `${baseUrl}/${domain}/${version}/seller`;
    }
    if ((!bap_id || bap_id === DEFAULT_BAP_ID) && (!bpp_id || bpp_id === DEFAULT_BPP_ID)) {
      throw new Error('Both bap_id and bpp_id are missing for retail domain.');
    }
  }
  
  return { bap_id, bpp_id };
}

export async function validateLogs(
  flowId: string,
  parsedPayload: ParsedPayload,
  originalPayloads?: Array<{ key: string, jsonRequest: any }>,
  options?: { isUtility?: boolean; sessionId?: string }
): Promise<Result> {
  logInfo({
    message: "Entering validateLogs function. Validating logs...",
    meta: { flowId, parsedPayload, isUtility: options?.isUtility },
  });
  const validationUrl = VALIDATION_URL[parsedPayload?.domain] || "https://log-validation.ondc.org/api/validate";

  try {
    // Get session details from Redis
    let sessionDetails: any = null;
    if (options?.sessionId) {
      try {
        const { RedisService } = require("ondc-automation-cache-lib");
        sessionDetails = await RedisService.getKey(`sessionDetails:${options.sessionId}`);
        if (sessionDetails) {
          sessionDetails = JSON.parse(sessionDetails);
        }
      } catch (error) {
        logError({ 
          message: 'Failed to get session details from Redis', 
          error, 
          meta: { sessionId: options.sessionId } 
        });
      }
    }
    
    // Construct IDs using helper function
    const { bap_id, bpp_id } = constructIds(
      parsedPayload.domain,
      parsedPayload.version,
      originalPayloads,
      sessionDetails
    );
    // Construct the validation payload
    const validationPayload = originalPayloads && originalPayloads.length > 0 ? {
      domain: parsedPayload.domain,
      version: parsedPayload.version,
      flow: parsedPayload.flow,
      bap_id,
      bpp_id,
      payload: originalPayloads.reduce((acc, { key, jsonRequest }) => {
        acc[key] = jsonRequest;
        return acc;
      }, {} as Record<string, any>),
    } : {
      ...parsedPayload,
      bap_id,
      bpp_id
    };
    const response = await axios.post<ApiResponse>(
      validationUrl,
      validationPayload
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
      logError({
        message: "Error occurred during validation : Axios error",
        error: axiosError,
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
    logError({
      message: "Error occurred during validation : Non-axios error",
      error,
      meta: {
        flowId,
      },
    });
    // Handle unexpected errors
    return {
      success: false,
      error: "Unexpected error during validation",
      details: (error as Error).message,
    };
  }
}
