// Explicit mapping for ONDC:RET11 (retail domain) flowIds to curl structure IDs as per utility_curls.sh
export const RETAIL_FLOW_CURL_MAPPINGS: Record<string, string> = {
  FULL_CATALOG: "1",
  INCREMENTAL_CATALOG: "1",
  ORDER_FLOW: "2",
  OUT_OF_STOCK: "3",
  BUYER_CANCEL: "4",
  RTO_PLUS_PART_CANCELLATION: "5",
  RETURN_FLOW: "6",
  FORCE_CANCEL: "7",
  // Add more mappings as needed based on utility_curls.sh
};

// Flow action sequences from ReportingConfig.yaml
const FLOW_ACTION_SEQUENCES: Record<string, string[]> = {
  "FULL_CATALOG": ["search", "on_search"],
  "INCREMENTAL_CATALOG": ["search", "on_search", "on_search", "on_search", "search"],
  "ORDER_FLOW": ["select", "on_select", "init", "on_init", "confirm", "on_confirm", "on_status", "on_status", "on_status", "on_status", "on_status", "track", "on_track", "on_status", "on_status"],
  "OUT_OF_STOCK": ["select", "on_select", "select", "on_select", "init", "on_init", "confirm", "on_confirm", "on_status", "on_status", "on_status", "on_status", "on_status", "on_status", "on_status"],
  "BUYER_CANCEL": ["select", "on_select", "init", "on_init", "confirm", "on_confirm", "cancel", "on_cancel"],
  "RTO_PLUS_PART_CANCELLATION": ["select", "on_select", "init", "on_init", "confirm", "on_confirm", "on_update", "update", "on_status", "on_status", "on_status", "on_status", "on_status", "on_status", "on_cancel", "on_status"],
  "RETURN_FLOW": ["select", "on_select", "init", "on_init", "confirm", "on_confirm", "on_status", "on_status", "on_status", "on_status", "on_status", "on_status", "on_status", "update", "on_update", "on_update", "update"],
  "FORCE_CANCEL": ["select", "on_select", "init", "on_init", "confirm", "on_confirm", "on_status", "on_status", "on_status", "on_status", "on_status", "cancel", "cancel", "on_cancel", "update"]
};

// Mapping from flow actions to utility_curls.sh keys
const UTILITY_FLOW_KEY_MAPPINGS: Record<string, Record<number, string>> = {
  "1": { // FULL_CATALOG
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh",
    2: "search_inc_refresh", // Empty object for missing actions
    3: "on_search_inc_refresh" // Empty object for missing actions
  },
  "2": { // ORDER_FLOW
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh", 
    2: "select",
    3: "on_select",
    4: "init",
    5: "on_init",
    6: "confirm",
    7: "on_confirm",
    8: "on_status_pending",
    9: "on_status_packed",
    10: "on_status_picked",
    11: "on_status_out_for_delivery",
    12: "on_status_delivered"
  },
  "3": { // OUT_OF_STOCK
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh",
    2: "select_out_of_stock",
    3: "on_select_out_of_stock",
    4: "select",
    5: "on_select",
    6: "init",
    7: "on_init",
    8: "confirm",
    9: "on_confirm",
    10: "on_status_pending",
    11: "on_status_packed",
    12: "on_status_picked",
    13: "on_status_out_for_delivery",
    14: "on_status_delivered"
  },
  "4": { // BUYER_CANCEL
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh",
    2: "select",
    3: "on_select",
    4: "init",
    5: "on_init",
    6: "confirm",
    7: "on_confirm",
    8: "cancel",
    9: "on_cancel"
  },
  "5": { // RTO_PLUS_PART_CANCELLATION
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh",
    2: "select",
    3: "on_select",
    4: "init",
    5: "on_init",
    6: "confirm",
    7: "on_confirm",
    8: "on_update_part_cancel",
    9: "update_settlement_part_cancel",
    10: "on_status_pending",
    11: "on_status_packed",
    12: "on_status_picked",
    13: "on_status_out_for_delivery",
    14: "on_cancel",
    15: "on_status_rto_delivered/disposed"
  },
  "6": { // RETURN_FLOW
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh",
    2: "select",
    3: "on_select",
    4: "init",
    5: "on_init",
    6: "confirm",
    7: "on_confirm",
    8: "on_status_pending",
    9: "on_status_packed",
    10: "on_status_picked",
    11: "on_status_out_for_delivery",
    12: "on_status_delivered",
    13: "update_liquidated",
    14: "on_update_interim_liquidated",
    15: "on_update_liquidated",
    16: "update_settlement_liquidated"
  },
  "7": { // FORCE_CANCEL
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh",
    2: "catalog_rejection"
  }
};

export function getRetailCurlFlowId(flowId: string): string {
  return RETAIL_FLOW_CURL_MAPPINGS[flowId] || flowId;
}

export function getUtilityFlowPayload(flowId: string, originalFlowId: string, payloads: any[]): Record<string, any> {
  const keyMappings = UTILITY_FLOW_KEY_MAPPINGS[flowId];
  const actionSequence = FLOW_ACTION_SEQUENCES[originalFlowId];
  
  if (!keyMappings || !actionSequence) {
    return {};
  }
  
  const result: Record<string, any> = {};
  
  // Initialize all expected keys with empty objects
  Object.values(keyMappings).forEach(key => {
    result[key] = {};
  });
  
  // Fill in actual payload data where available
  payloads.forEach((payload, index) => {
    if (index < actionSequence.length) {
      const expectedKey = keyMappings[index];
      if (expectedKey) {
        result[expectedKey] = payload.jsonRequest || {};
      }
    }
  });
  
  return result;
} 