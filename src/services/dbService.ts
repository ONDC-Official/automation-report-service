import { Payload } from "../types/payload";  // Import Payload type for type-checking the fetched data


// Fetches payloads from a storage URL based on a provided session ID
export async function fetchPayloads(sessionID: string): Promise<Payload[]> {
  const storageUrl = process.env.STORAGE_URL;  // Get the storage URL from environment variables
  const dbUrl = `${storageUrl}/${sessionID}`;  // Construct the URL for the session-specific payloads
  
  // Perform a fetch request to retrieve payloads from the constructed URL
  const response = await fetch(dbUrl);

  // If the response is not successful, throw an error
  if (!response.ok) {
    throw new Error(`Failed to fetch payloads for session ID: ${sessionID}`);
  }

  // Parse the response JSON and return it as an array of Payload objects
  return response.json();
}