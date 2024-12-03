export interface ValidationResult {
    transactionId: string;
    test_case: string;
    status: string;
    details?: Record<string, any>; // Optional field for additional details
  }