import { Payload } from '../types/payload';
require('dotenv').config();

export async function fetchPayloads(sessionID: string): Promise<Payload[]> {
  const storageUrl = process.env.STORAGE_URL
  const dbUrl = `${storageUrl}/${sessionID}`;
  const response = await fetch(dbUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch payloads for session ID: ${sessionID}`);
  }
  return response.json();
}