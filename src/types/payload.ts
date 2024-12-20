export interface Payload {
  id: number;
  messageId: string;
  transactionId: string;
  flowId: string;
  action: string; // e.g., "SEARCH"
  bppId: string | null; // Can be null
  bapId: string;
  jsonRequest: Record<string, any>;
  jsonResponse: Record<string, any>;
  httpStatus: number;
  createdAt: string; // ISO 8601 formatted timestamp
  updatedAt: string; // ISO 8601 formatted timestamp
}

export interface JsonRequest {
  context: Record<string, any>;
  messgae: Record<string, any>;
  error: Record<string, any>;
}

export interface TestResult {
  response: object;
  passed: string[];
  failed: string[];
}

export interface FlowValidationResult {
  valid_flow: boolean;
  errors: string[];
  messages: Record<string, string>;
}

export type ParsedMessage = {
  ackStatus: "ACK" | "NACK" | null;
  errorCode?: string;
  errorMessage?: string;
  passed: string[];
  failed: string[];
};
