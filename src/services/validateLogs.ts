
import { ValidationResult } from "../types/validationResult";
import { ParsedPayload } from '../types/parsedPayload'

import axios, { AxiosError } from 'axios';

export async function validateLogs(
  parsedPayload: ParsedPayload,
  validationUrl: string
): Promise<ValidationResult> {
  try {
    const response = await axios.post<ValidationResult>(validationUrl, parsedPayload);
    return response.data;
  } catch (error) {
    // Check if the error is an AxiosError
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const errorDetails = axiosError.response?.data 
        ? JSON.stringify(axiosError.response.data) 
        : 'No response data';
      const statusCode = axiosError.response?.status || 'Unknown status code';


      // Log additional details or rethrow with specific information
      throw new Error(`Validation failed with status ${statusCode}: ${errorDetails}`);
    }

    // For non-Axios errors, rethrow with the original stack trace
    throw new Error(`Unexpected error during validation: ${(error as Error).message}`);
  }
}