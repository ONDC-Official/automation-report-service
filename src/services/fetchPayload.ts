import axios from "axios";
import { Payload } from "../types/payload"; // Adjust the path as necessary

export async function fetchPayload(transactionId: string, storageUrl: string): Promise<Payload[]> {
  try {
    // Construct the URL with the query parameter
    const url = `${storageUrl}?transactionId=${encodeURIComponent(transactionId)}`;
 
    // Make the GET request
    const response = await axios.get<Payload[]>(url);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to fetch payload: ${error}`);
  }
}