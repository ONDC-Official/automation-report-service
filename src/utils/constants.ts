export const actions: String[] = [
  "search",
  "on_search",
  "select",
  "on_select",
  "init",
  "on_init",
  "confirm",
  "on_confirm",
  "cancel",
  "on_cancel",
  "update",
  "on_update",
  "on_status",
];

export const MANDATORY_FLOWS: String[] = [
  "STATION_CODE_FLOW",
  "TECHNICAL_CANCELLATION_FLOW",
];

export const BUYER_CANCEL_CODES: String[] = ["001", "002", "003", "004", "005"];

export const SELLER_CANCEL_CODES: String[] = ["011", "012", "013", "014"];
export const ENABLED_DOMAINS: String[] = ["ONDC:TRV11"];

export const FLOW_MAPPINGS: Record<string, string> = {
  //METRO
  STATION_CODE_FLOW_ORDER: "METRO_STATION_CODE",
  STATION_CODE_FLOW_CATALOG: "METRO_STATION_CODE",
  TECHNICAL_CANCELLATION_FLOW: "METRO_TECHNICAL_CANCEL",
};

export const VALIDATION_URL: Record<string, string> = {
  "ONDC:TRV10": "https://log-validation.ondc.org/api/validate/trv",
  "ONDC:TRV11": "https://log-validation.ondc.org/api/validate/trv",
  "ONDC:RET10": "https://log-validation.ondc.org/api/validate",
  "ONDC:RET11": "https://log-validation.ondc.org/api/validate",
  "ONDC:RET12": "https://log-validation.ondc.org/api/validate",
  "ONDC:FIS12": "https://log-validation.ondc.org/api/validate/fis/fis12",
};
