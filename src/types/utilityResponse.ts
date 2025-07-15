export interface ApiResponse {
    success: boolean;
    response: {
      message: string;
      report: Record<string, any>; // Define the structure of 'report' if known
      bpp_id: string;
      bap_id: string;
      domain: string;
      payload: Record<string, any>;
      reportTimestamp?: string;
    };
    signature: string;
    signTimestamp?: string;
  }