import { Response } from "express";
import { MESSAGES } from "./messages";

// Standard response structure
interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

// Response handler class for consistent API responses
export class apiResponse {
  /**
   * Send a successful response
   */
  static success<T>(res: Response, data: T, message?: string, statusCode: number = 200): void {
    const response: ApiResponse<T> = {
      success: true,
      message: message || "Request successful",
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(response);
  }

  /**
   * Send a successful response with HTML content
   */
  static successHTML(res: Response, html: string, statusCode: number = 200): void {
    res.status(statusCode).set('Content-Type', 'text/html').send(html);
  }

  /**
   * Send a bad request error (400)
   */
  static badRequest(res: Response, message?: string): void {
    const response: ApiResponse = {
      success: false,
      message: message || MESSAGES.responses.missingSessionId,
      error: "Bad Request",
      timestamp: new Date().toISOString(),
    };
    res.status(400).json(response);
  }

  /**
   * Send an unauthorized error (401)
   */
  static unauthorized(res: Response, message?: string): void {
    const response: ApiResponse = {
      success: false,
      message: message || "Unauthorized access",
      error: "Unauthorized",
      timestamp: new Date().toISOString(),
    };
    res.status(401).json(response);
  }

  /**
   * Send a forbidden error (403)
   */
  static forbidden(res: Response, message?: string): void {
    const response: ApiResponse = {
      success: false,
      message: message || "Access forbidden",
      error: "Forbidden",
      timestamp: new Date().toISOString(),
    };
    res.status(403).json(response);
  }

  /**
   * Send a not found error (404)
   */
  static notFound(res: Response, message?: string): void {
    const response: ApiResponse = {
      success: false,
      message: message || "Resource not found",
      error: "Not Found",
      timestamp: new Date().toISOString(),
    };
    res.status(404).json(response);
  }

  /**
   * Send an internal server error (500)
   */
  static internalError(res: Response, message?: string, error?: any): void {
    const response: ApiResponse = {
      success: false,
      message: message || MESSAGES.responses.failedToGenerateReport,
      error: "Internal Server Error",
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }

  /**
   * Send a validation error (422)
   */
  static validationError(res: Response, message?: string, errors?: any): void {
    const response: ApiResponse = {
      success: false,
      message: message || "Validation failed",
      error: "Validation Error",
      data: errors,
      timestamp: new Date().toISOString(),
    };
    res.status(422).json(response);
  }

  /**
   * Send a custom error response
   */
  static error(res: Response, statusCode: number, message: string, error?: any): void {
    const response: ApiResponse = {
      success: false,
      message,
      error: error || "Error",
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(response);
  }
}

// Legacy compatibility - simple response functions
export const sendSuccess = apiResponse.success;
export const sendError = apiResponse.error;
export const sendBadRequest = apiResponse.badRequest;
export const sendInternalError = apiResponse.internalError;
