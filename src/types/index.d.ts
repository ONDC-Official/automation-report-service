// Types for Payload, Parsed Data, and Validation Results
type Payload = {
    logs: Array<{ time: string; details: string }>;
  };
  
  interface ParsedPayload {
    domain: string;
    version: string;
    flow: string;
    payload: {
      [key: string]: Record<string, any>; // Represents any type of JSON object for each type
    };
  }
  
 