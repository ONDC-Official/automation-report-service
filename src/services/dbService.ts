import axios from "axios";
import { Payload, WrappedPayload } from "../types/payload";
import dotenv from "dotenv";
import logger from "@ondc/automation-logger";
// Load environment variables
dotenv.config();

const API_URL = `${process.env.DATA_BASE_URL}/payload/ids`;

export async function fetchPayloads(
  requestBody: Record<string, string[]>
): Promise<Record<string, Payload[]>> {
  logger.info(`Entering fetchPayloads function. Fetching payloads...`, {
    requestBody,
  });

  try {
    const results = await Promise.all(
      Object.entries(requestBody).map(async ([flowId, payloadIds]) => {
        try {
          const response = await axios.post<{ payloads: Payload[] }>(
            API_URL,
            { payload_ids: payloadIds },
            {
              headers: { "Content-Type": "application/json" },
            }
          );
          logger.info(`Fetched payloads for flow ID ${flowId}`, {
            flowId,
            payloads: response.data.payloads,
          });
          return { [flowId]: response.data.payloads };
        } catch (error) {
          // console.error(`Error fetching payloads for flow ID ${flowId}:`, error);
          logger.error(
            `Error fetching payloads for flow ID ${flowId}`,
            {
              flowId,
              error,
            },
            error
          );
          return { [flowId]: [] }; // Return an empty array in case of an error
        }
      })
    );
    logger.info("Exiting fetchPayloads function. Fetched payloads.", {
      results,
    });
    return Object.assign({}, ...results);
  } catch (error) {
    // console.error("Error fetching data:", error);
    logger.error(
      "Error in fetchPayloads function",
      {
        error,
      },
      new Error("Failed to fetch payloads")
    );
    throw new Error("Failed to fetch payloads");
  }
}

export async function fetchSessionDetails(sessionID: string): Promise<any> {
  logger.info(
    `Entering fetchSessionDetails function. Fetching session details for session ID: ${sessionID}`,
    {
      sessionID,
    }
  );
  try {
    const storageUrl = `${process.env.DATA_BASE_URL}/api/sessions/${sessionID}`;
    const response = await axios.get<WrappedPayload[]>(storageUrl, {
      headers: {
        "x-api-key": process.env.API_SERVICE_KEY, // replace with your header name if different
      },
    });
    // logInfo({
    //   message: `Exiting fetchSessionDetails function. Fetched session details.`,
    //   meta: {
    //     sessionID,
    //     response: response.data,
    //   },
    // });
    return response.data;
  } catch (error) {
    let errorDetails = "Unknown error";

    if (axios.isAxiosError(error) && error.response) {
      errorDetails = JSON.stringify(error.response.data);
    }

    // console.error(`Failed to fetch details for session ID ${sessionID}:`, errorDetails);
    logger.error(
      `Failed to fetch details for session ID ${sessionID}`,
      {
        sessionID,
        errorDetails,
      },
      new Error(errorDetails)
    );
    throw new Error(
      `Failed to fetch details for session ID ${sessionID}, Details: ${errorDetails}`
    );
  }
}

export async function getPayloadsByTransactionAndSession(
  transactionId: string,
  sessionId?: string
) {
  try {
    const response = await axios.get(
      `${process.env.DATA_BASE_URL}/payload/logs/${transactionId}`,
      {
        headers: {
          "x-api-key": process.env.API_SERVICE_KEY,
        },
      }
    );
    const payloads = response.data;
    // Filter by sessionId if provided
    const filteredPayloads = Array.isArray(payloads)
      ? sessionId
        ? payloads.filter(
            (p: any) => String(p.sessionId).trim() === String(sessionId).trim()
          )
        : payloads
      : [];

    return filteredPayloads;
  } catch (error) {
    console.error(
      `Error fetching payloads for transactionId ${transactionId}:`,
      error
    );
    throw new Error("Failed to fetch payloads from DB API");
  }
}
