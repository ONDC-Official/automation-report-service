import axios from "axios";
import { Payload, WrappedPayload } from "../types/payload";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const API_URL = `${process.env.STORAGE_URL}/payload/ids`;

export async function fetchPayloads(requestBody: Record<string, string[]>): Promise<Record<string, Payload[]>> {
  try {
    const results = await Promise.all(
      Object.entries(requestBody).map(async ([flowId, payloadIds]) => {
        try {
          const response = await axios.post<{ payloads: Payload[] }>(API_URL, { payload_ids: payloadIds }, {
            headers: { "Content-Type": "application/json" },
          });
          return { [flowId]: response.data.payloads };
        } catch (error) {
          console.error(`Error fetching payloads for flow ID ${flowId}:`, error);
          return { [flowId]: [] }; // Return an empty array in case of an error
        }
      })
    );
    
    return Object.assign({}, ...results);
  } catch (error) {
    console.error("Error fetching data:", error);
    throw new Error("Failed to fetch payloads");
  }
}

export async function fetchSessionDetails(sessionID: string): Promise<WrappedPayload[]> {
  try {
    const storageUrl = `${process.env.STORAGE_URL}/api/sessions/${sessionID}`;
    const response = await axios.get<WrappedPayload[]>(storageUrl);
    return response.data;
  } catch (error) {
    let errorDetails = "Unknown error";
    
    if (axios.isAxiosError(error) && error.response) {
      errorDetails = JSON.stringify(error.response.data);
    }
    
    console.error(`Failed to fetch details for session ID ${sessionID}:`, errorDetails);
    throw new Error(`Failed to fetch details for session ID ${sessionID}, Details: ${errorDetails}`);
  }
}
