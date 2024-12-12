export interface Payload {
    id: number;
    messageId: string;
    transactionId: string;
    flowId: string;
    action: string; // e.g., "SEARCH"
    bppId: string | null; // Can be null
    bapId: string;
    jsonObject: Record<string, any>; // Keeping jsonObject flexible for now
    type: string; // e.g., "REQUEST"
    httpStatus: number;
    createdAt: string; // ISO 8601 formatted timestamp
    updatedAt: string; // ISO 8601 formatted timestamp
  }