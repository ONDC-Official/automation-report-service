import { ApiResponse } from "../types/utilityResponse";
import axios, { AxiosError } from "axios";
import { ParsedPayload } from "../types/parsedPayload";
import { Result } from "../types/result";
import dotenv from "dotenv";
import { VALIDATION_URL } from "../utils/constants";
import { logError, logger, logInfo } from "../utils/logger";
import { writeFileSync } from "fs";
dotenv.config();

export async function validateFlows(parsedFlows: {
  [flowId: string]: ParsedPayload;
}): Promise<{ flowId: string; results: Result }[]> {
  logInfo({
    message: "Entering validateFlows function. Validating flows...",
    meta: parsedFlows,
  });
  try {
    const validatedFlows = await Promise.all(
      Object.entries(parsedFlows).map(async ([flowId, parsedPayload]) => {
        const results = await validateLogs(flowId, parsedPayload);
        return { flowId, results };
      })
    );
    logInfo({
      message: "Exiting validateFlows function. Validated flows.",
      meta: {validatedFlows},
    });
    return validatedFlows;
  } catch (error) {
    // console.error("Error occurred while validating flows:", error);
    logInfo({
      message: "Error occurred while validating flows",
      error,
      meta: {
        parsedFlows,
      },
    });
    throw error;
  }
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
  const validationUrl =
   VALIDATION_URL[parsedPayload?.domain] ||
    "https://log-validation.ondc.org/api/validate";

  // logger.info(`Utility URL : ${validationUrl}`);
  logInfo({
    message: "Utility URL:",
    meta: { validationUrl },
  });
  try {
    let bap_id = "<BUYER_APP_SUBSCRIBER_ID>";
    let bpp_id = "<SELLER_APP_SUBSCRIBER_ID>";
    let domain = parsedPayload.domain;
    let version = parsedPayload.version;
    const retailDomains = [
      "ONDC:RET10", "ONDC:RET11", "ONDC:RET12", "ONDC:RET13", "ONDC:RET14", "ONDC:RET15", "ONDC:RET16", "ONDC:RET17", "ONDC:RET18"
    ];
    
    // First try to get IDs from payloads
    if (originalPayloads && originalPayloads.length > 0) {
      const ctx = originalPayloads[0].jsonRequest?.context;
      if (ctx) {
        if (ctx.bap_id) bap_id = ctx.bap_id;
        if (ctx.bpp_id) bpp_id = ctx.bpp_id;
      }
    }
    
    // Get session details from Redis to get npType and npId
    const { RedisService } = require("ondc-automation-cache-lib");
    let sessionDetails: any = null;
    if (options?.sessionId) {
      try {
        sessionDetails = await RedisService.getKey(`sessionDetails:${options.sessionId}`);
        if (sessionDetails) {
          sessionDetails = JSON.parse(sessionDetails);
          logInfo({ message: 'Retrieved session details from Redis', meta: { sessionDetails } });
        }
      } catch (error) {
        logError({ message: 'Failed to get session details from Redis', error, meta: { sessionId: options.sessionId } });
      }
    }
    
    // Use session details to set bap_id or bpp_id based on npType
    if (sessionDetails) {
      if (sessionDetails.npType === 'BAP' && sessionDetails.npId) {
        bap_id = sessionDetails.npId;
        // Construct bpp_id if not present
        if (bpp_id === "<SELLER_APP_SUBSCRIBER_ID>" || !bpp_id) {
          const baseUrl = process.env.RETAIL_API_SERVICE_BASE_URL || "https://dev-automation.ondc.org/api-service";
          bpp_id = `${baseUrl}/${domain}/${version}/seller`;
          logInfo({ message: 'Constructed bpp_id from session npType=BAP', meta: { bpp_id } });
        }
      } else if (sessionDetails.npType === 'BPP' && sessionDetails.npId) {
        bpp_id = sessionDetails.npId;
        // Construct bap_id if not present
        if (bap_id === "<BUYER_APP_SUBSCRIBER_ID>" || !bap_id) {
          const baseUrl = process.env.RETAIL_API_SERVICE_BASE_URL || "https://dev-automation.ondc.org/api-service";
          bap_id = `${baseUrl}/${domain}/${version}/buyer`;
          logInfo({ message: 'Constructed bap_id from session npType=BPP', meta: { bap_id } });
        }
      }
    }
    
    // Retail fallback logic (keep existing logic as secondary fallback)
    if (retailDomains.includes(domain)) {
      const baseUrl = process.env.RETAIL_API_SERVICE_BASE_URL || "https://dev-automation.ondc.org/api-service";
      if ((bap_id === "<BUYER_APP_SUBSCRIBER_ID>" || !bap_id) && bpp_id && bpp_id !== "<SELLER_APP_SUBSCRIBER_ID>") {
        bap_id = `${baseUrl}/${domain}/${version}/buyer`;
        logInfo({ message: 'Retail fallback: Constructed bap_id', meta: { bap_id } });
      }
      if ((bpp_id === "<SELLER_APP_SUBSCRIBER_ID>" || !bpp_id) && bap_id && bap_id !== "<BUYER_APP_SUBSCRIBER_ID>") {
        bpp_id = `${baseUrl}/${domain}/${version}/seller`;
        logInfo({ message: 'Retail fallback: Constructed bpp_id', meta: { bpp_id } });
      }
      if ((bap_id === "<BUYER_APP_SUBSCRIBER_ID>" || !bap_id) && (bpp_id === "<SELLER_APP_SUBSCRIBER_ID>" || !bpp_id)) {
        logError({ message: 'Both bap_id and bpp_id are missing for retail domain. Throwing error.', meta: { domain, version } });
        throw new Error('Both bap_id and bpp_id are missing for retail domain.');
      }
    }
    let curlPayloadObj;
    if (originalPayloads && Array.isArray(originalPayloads) && originalPayloads.length > 0) {
      curlPayloadObj = {
        domain: parsedPayload.domain,
        version: parsedPayload.version,
        flow: parsedPayload.flow,
        bap_id,
        bpp_id,
        payload: originalPayloads.reduce((acc, { key, jsonRequest }) => {
          acc[key] = jsonRequest;
          return acc;
        }, {} as Record<string, any>),
      };
    } else {
      curlPayloadObj = parsedPayload;
    }
    const curlPayload = JSON.stringify(curlPayloadObj, null, 2);
    const curlCommand = `curl --location --request POST '${validationUrl}' \
--header 'Content-Type: application/json' \
--data '${curlPayload.replace(/'/g, "'\\''")}'`;
    // Save or append the curl command to the appropriate file
    if (options?.isUtility) {
      // Append to utility_validation_curls.sh
      const fs = require('fs');
      fs.appendFileSync('utility_validation_curls.sh', `#!/bin/bash\n${curlCommand}\n\n`);
      logInfo({ message: 'Appended utility curl command to utility_validation_curls.sh', meta: { curlCommand } });
    } else {
      // Overwrite last_validation_curl.sh
      writeFileSync('last_validation_curl.sh', `#!/bin/bash\n${curlCommand}\n`);
      logInfo({ message: 'Saved curl command to last_validation_curl.sh', meta: { curlCommand } });
    }
    const response = await axios.post<ApiResponse>(
      validationUrl,
      curlPayloadObj
    );
    // Save the validation response to a file for debugging
    if (options?.isUtility) {
      const responseData = {
        flowId,
        timestamp: new Date().toISOString(),
        request: curlPayloadObj,
        response: response.data
      };
      const fs = require('fs');
      const existingData = fs.existsSync('utility_validation_response.json') 
        ? JSON.parse(fs.readFileSync('utility_validation_response.json', 'utf8'))
        : [];
      existingData.push(responseData);
      fs.writeFileSync('utility_validation_response.json', JSON.stringify(existingData, null, 2));
      logInfo({ message: 'Saved validation response to utility_validation_response.json', meta: { responseData } });
    }
    
    logInfo({
      message: "Exiting validateLogs function. Validated logs.",
      meta: { flowId, response: response.data },
    }); 
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
