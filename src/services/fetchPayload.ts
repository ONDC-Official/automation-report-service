import axios from "axios";
import { Payload } from "../types/payload"; // Adjust the path as necessary

export async function fetchPayload(
  transactionId: string,
  storageUrl: string,
  timeout = 5000 // Default timeout of 5 seconds
): Promise<Payload[]> {
  try {    
    const response = await axios.get<Payload[]>(`${storageUrl}`, {
      params: { transactionId }, 
      timeout, // Set the timeout for the request
    });
    return response.data;
  } catch (error:any) {
    if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
      throw new Error(`Request timed out after ${timeout} ms for Transaction ID: ${transactionId}`);
    }
    throw new Error(`Failed to fetch payload: ${error.message}`);
  }
}