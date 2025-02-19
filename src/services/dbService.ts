import axios from "axios";
import { Payload, WrappedPayload } from "../types/payload"; // Import Payload type for type-checking the fetched data
import dotenv from "dotenv";
// Initialize dotenv to load environment variables
dotenv.config();
const API_URL = `${process.env.STORAGE_URL}/payload/ids`;

export async function fetchPayloads(requestBody: Record<string, string[]>) {
  try {
    const results = await Promise.all(
      Object.entries(requestBody).map(async ([flowId, payloadIds]) => {
        const response = await axios.post(
          API_URL,
          { payload_ids: payloadIds },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
        return { [flowId]: response?.data?.payloads };
      })
    );

    const finalResult = Object.assign({}, ...results);
    return finalResult;
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// // Fetches payloads from a storage URL based on a provided session ID
// export async function fetchPayloads(
//   sessionID: string
// ): Promise<WrappedPayload[]> {
//   const storageUrl = process.env.STORAGE_URL; // Get the storage URL from environment variables
//   const dbUrl = `${storageUrl}/${sessionID}`; // Construct the URL for the session-specific payloads

//   // Perform a fetch request to retrieve payloads from the constructed URL
//   const response = await fetch(dbUrl);

//   // If the response is not successful, throw an error
//   if (!response.ok) {
//     let errorDetails;

//     try {
//       // Attempt to parse JSON response body if available
//       errorDetails = await response.json();
//     } catch {
//       // Fallback to plain text if JSON parsing fails
//       errorDetails = await response.text();
//     }

//     throw new Error(
//       `Failed to fetch payloads for session ID: ${sessionID}, Details: ${JSON.stringify(
//         errorDetails
//       )}`
//     );
//   }

//   // Parse the response JSON and return it as an array of Payload objects
//   return response.json();
// }

// Fetches session details based on a provided session ID
export async function fetchSessionDetails(
  sessionID: string
): Promise<WrappedPayload[]> {
  const storageUrl = `${process.env.STORAGE_URL}/api/sessions`;
  const dbUrl = `${storageUrl}/${sessionID}`; // Construct the URL for the session-specific payloads

  // Perform a fetch request to retrieve session details from the constructed URL
  const response = await fetch(dbUrl);

  // If the response is not successful, throw an error
  if (!response.ok) {
    let errorDetails;

    try {
      // Attempt to parse JSON response body if available
      errorDetails = await response.json();
    } catch {
      // Fallback to plain text if JSON parsing fails
      errorDetails = await response.text();
    }

    throw new Error(
      `Failed to fetch details for session ID: ${sessionID}, Details: ${JSON.stringify(
        errorDetails
      )}`
    );
  }

  // Parse the response JSON and return it as an array of Payload objects
  return response.json();
}
