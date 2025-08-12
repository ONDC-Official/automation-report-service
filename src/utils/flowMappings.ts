import { logInfo, logError } from "../utils/logger";

// Helper function to group payloads by context.action
function groupPayloadsByAction(payloads: any[]): Record<string, any[]> {
  return payloads.reduce((groups, payload) => {
    const action = payload.jsonRequest?.context?.action;
    if (action) {
      groups[action] = groups[action] || [];
      groups[action].push(payload);
    }
    return groups;
  }, {});
}

// Helper function to sort payloads by timestamp
function sortByTimestamp(payloads: any[]): any[] {
  return payloads.sort((a, b) => {
    const timestampA = new Date(a.jsonRequest?.context?.timestamp || 0).getTime();
    const timestampB = new Date(b.jsonRequest?.context?.timestamp || 0).getTime();
    return timestampA - timestampB;
  });
}

// Helper function to find payload by action
function findPayloadByAction(payloadsByAction: Record<string, any[]>, action: string, index: number = 0): any {
  const actionPayloads = payloadsByAction[action] || [];
  if (actionPayloads.length === 0) return {};
  
  const sortedPayloads = sortByTimestamp(actionPayloads);
  return sortedPayloads[index] || {};
}

// Helper function to find cancel payload based on force parameter
function findCancelPayload(payloadsByAction: Record<string, any[]>, expectedKey: string, actionIndex: number = 0): any {
  const cancelPayloads = payloadsByAction['cancel'] || [];
  if (cancelPayloads.length === 0) return {};

  const sortedPayloads = sortByTimestamp(cancelPayloads);
  
  if (expectedKey === 'force_cancel') {
    // Find cancel payload with force: "yes"
    const forceCancelPayload = sortedPayloads.find(payload => 
      extractForceParameter(payload.jsonRequest) === 'yes'
    );
    return forceCancelPayload || {};
  } else if (expectedKey === 'cancel') {
    // Find cancel payload with force: "no" or use index-based for regular cancel
    if (sortedPayloads.length === 1) {
      // If only one cancel payload, use it regardless of force parameter
      return sortedPayloads[0] || {};
    } else {
      // Multiple cancel payloads - find the one with force: "no" or use index
      const regularCancelPayload = sortedPayloads.find(payload => 
        extractForceParameter(payload.jsonRequest) === 'no'
      );
      return regularCancelPayload || sortedPayloads[actionIndex] || {};
    }
  }
  
  return {};
}

// Status key to fulfillment state mapping
const STATUS_KEY_MAPPING: Record<string, string> = {
  'on_status_pending': 'Pending',
  'on_status_packed': 'Packed',
  'on_status_agent_assigned': 'Agent-assigned',
  'on_status_at_pickup': 'At-pickup',
  'on_status_out_for_pickup': 'Out-for-pickup',
  'on_status_pickup_failed': 'Pickup-failed',
  'on_status_picked': 'Order-picked-up',
  'on_status_at_delivery': 'At-delivery',
  'on_status_in_transit': 'In-transit',
  'on_status_at_destination_hub': 'At-destination-hub',
  'on_status_out_for_delivery': 'Out-for-delivery',
  'on_status_delivery_failed': 'Delivery-failed',
  'on_status_delivered': 'Order-delivered',
  'on_status_rto_delivered': 'RTO-Delivered'
};

// Helper function to extract fulfillment state from on_status payload
function extractFulfillmentState(jsonRequest: any): string {
  try {
    return jsonRequest?.message?.order?.fulfillments?.[0]?.state?.descriptor?.code || '';
  } catch (error) {
    return '';
  }
}

// Helper function to extract force parameter from cancel payload
function extractForceParameter(jsonRequest: any): string {
  try {
    const tags = jsonRequest?.message?.descriptor?.tags || [];
    const paramsTag = tags.find((tag: any) => tag.code === 'params');
    if (paramsTag && paramsTag.list) {
      const forceParam = paramsTag.list.find((item: any) => item.code === 'force');
      return forceParam?.value || 'no'; // default to 'no' if not found
    }
    return 'no';
  } catch (error) {
    return 'no';
  }
}

// Helper function to find on_status payload with specific fulfillment state
function findStatusPayload(payloadsByAction: Record<string, any[]>, expectedKey: string): any {
  const statusPayloads = payloadsByAction['on_status'] || [];
  if (statusPayloads.length === 0) return {};

  const expectedState = STATUS_KEY_MAPPING[expectedKey];
  if (!expectedState) return {};

  const matchingPayload = statusPayloads.find(payload => {
    const fulfillmentState = extractFulfillmentState(payload.jsonRequest);
    return fulfillmentState === expectedState;
  });

  return matchingPayload || {};
}

// Helper function to extract action from utility key
function extractActionFromKey(key: string): string {
  if (key.startsWith('on_status_')) return 'on_status';
  if (key.startsWith('search_')) return key.includes('inc') ? 'search' : 'search';
  if (key.startsWith('on_search_')) return 'on_search';
  if (key.startsWith('select_')) return 'select';
  if (key.startsWith('on_select_')) return 'on_select';
  if (key.startsWith('update_')) return 'update';
  if (key.startsWith('on_update_')) return 'on_update';
  if (key === 'force_cancel') return 'cancel'; // force_cancel maps to cancel action but with force: yes
  return key; // For basic actions like select, init, confirm, etc.
}

// Retail domains use external validation, not internal validation modules
// This mapping translates flow names to numeric IDs expected by the external validation API
// The numeric IDs correspond to flows defined in utility_curls.sh
// Explicit mapping for ONDC:RET11 (retail domain) flowIds to curl structure IDs as per utility_curls.sh
export const RETAIL_FLOW_CURL_MAPPINGS: Record<string, string> = {
  FULL_CATALOG: "1",
  INCREMENTAL_CATALOG: "1",
  ORDER_FLOW: "2",
  OUT_OF_STOCK: "3",
  BUYER_CANCEL: "4",
  RTO_PLUS_PART_CANCELLATION: "5",
  RETURN_FLOW: "6",
  FORCE_CANCEL: "005",
  // Add more mappings as needed based on utility_curls.sh
};

// Flow action sequences from ReportingConfig.yaml
const FLOW_ACTION_SEQUENCES: Record<string, string[]> = {
  FULL_CATALOG: ["search", "on_search"],
  INCREMENTAL_CATALOG: [
    "search",
    "on_search",
    "on_search",
    "on_search",
    "search",
  ],
  ORDER_FLOW: [
    "select",
    "on_select",
    "init",
    "on_init",
    "confirm",
    "on_confirm",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "track",
    "on_track",
    "on_status",
    "on_status",
  ],
  OUT_OF_STOCK: [
    "select",
    "on_select",
    "select",
    "on_select",
    "init",
    "on_init",
    "confirm",
    "on_confirm",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
  ],
  BUYER_CANCEL: [
    "select",
    "on_select",
    "init",
    "on_init",
    "confirm",
    "on_confirm",
    "cancel",
    "on_cancel",
  ],
  RTO_PLUS_PART_CANCELLATION: [
    "select",
    "on_select",
    "init",
    "on_init",
    "confirm",
    "on_confirm",
    "on_update",
    "update",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_cancel",
    "on_status",
  ],
  RETURN_FLOW: [
    "select",
    "on_select",
    "init",
    "on_init",
    "confirm",
    "on_confirm",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "update",
    "on_update",
    "on_update",
    "update",
  ],
  FORCE_CANCEL: [
    "select",
    "on_select",
    "init",
    "on_init",
    "confirm",
    "on_confirm",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "on_status",
    "cancel",
    "cancel",
    "on_cancel",
  ],
};

// Mapping from flow actions to utility_curls.sh keys
const UTILITY_FLOW_KEY_MAPPINGS: Record<string, Record<number, string>> = {
  "1": {
    // FULL_CATALOG
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh",
    2: "search_inc_refresh", // Empty object for missing actions
    3: "on_search_inc_refresh", // Empty object for missing actions
  },
  "2": {
    // ORDER_FLOW
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
    10: "on_status_agent_assigned",
    11: "on_status_at_pickup",
    12: "on_status_out_for_pickup",
    13: "on_status_pickup_failed",
    14: "on_status_picked",
    15: "on_status_at_delivery",
    16: "on_status_in_transit",
    17: "on_status_at_destination_hub",
    18: "on_status_out_for_delivery",
    19: "on_status_delivery_failed",
    20: "on_status_delivered",
    21: "track",
    22: "on_track",
  },
  "3": {
    // OUT_OF_STOCK
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
    12: "on_status_agent_assigned",
    13: "on_status_at_pickup",
    14: "on_status_out_for_pickup",
    15: "on_status_pickup_failed",
    16: "on_status_picked",
    17: "on_status_at_delivery",
    18: "on_status_in_transit",
    19: "on_status_at_destination_hub",
    20: "on_status_out_for_delivery",
    21: "on_status_delivery_failed",
    22: "on_status_delivered",
  },
  "4": {
    // BUYER_CANCEL
    0: "search_full_catalog_refresh",
    1: "on_search_full_catalog_refresh",
    2: "select",
    3: "on_select",
    4: "init",
    5: "on_init",
    6: "confirm",
    7: "on_confirm",
    8: "cancel",
    9: "on_cancel",
  },
  "5": {
    // RTO_PLUS_PART_CANCELLATION
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
    12: "on_status_agent_assigned",
    13: "on_status_at_pickup",
    14: "on_status_out_for_pickup",
    15: "on_status_pickup_failed",
    16: "on_status_picked",
    17: "on_status_at_delivery",
    18: "on_status_in_transit",
    19: "on_status_at_destination_hub",
    20: "on_status_out_for_delivery",
    21: "on_status_delivery_failed",
    22: "on_cancel",
    23: "on_status_rto_delivered",
  },
  "6": {
    // RETURN_FLOW
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
    10: "on_status_agent_assigned",
    11: "on_status_at_pickup",
    12: "on_status_out_for_pickup",
    13: "on_status_pickup_failed",
    14: "on_status_picked",
    15: "on_status_at_delivery",
    16: "on_status_in_transit",
    17: "on_status_at_destination_hub",
    18: "on_status_out_for_delivery",
    19: "on_status_delivery_failed",
    20: "on_status_delivered",
    21: "update_liquidated",
    22: "on_update_interim_liquidated",
    23: "on_update_liquidated",
    24: "update_settlement_liquidated",
  },
  "005": {
    // FORCE_CANCEL
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
    10: "on_status_agent_assigned",
    11: "on_status_at_pickup",
    12: "on_status_out_for_pickup",
    13: "on_status_pickup_failed",
    14: "on_status_picked",
    15: "on_status_at_delivery",
    16: "on_status_in_transit",
    17: "on_status_at_destination_hub",
    18: "on_status_out_for_delivery",
    19: "on_status_delivery_failed",
    20: "cancel",
    21: "force_cancel",
    22: "on_cancel",
  },
};

export function getRetailCurlFlowId(flowId: string): string {
  return RETAIL_FLOW_CURL_MAPPINGS[flowId] || flowId;
}

export function getUtilityFlowPayload(
  flowId: string,
  originalFlowId: string,
  payloads: any[],
  catalogPayloads?: any
): Record<string, any> {
  logInfo({
    message: "getUtilityFlowPayload called",
    meta: {
      flowId,
      originalFlowId,
      payloadCount: payloads.length,
      availableFlowIds: Object.keys(UTILITY_FLOW_KEY_MAPPINGS),
      availableOriginalFlowIds: Object.keys(FLOW_ACTION_SEQUENCES)
    }
  });

  const keyMappings = UTILITY_FLOW_KEY_MAPPINGS[flowId];
  const actionSequence = FLOW_ACTION_SEQUENCES[originalFlowId];

  if (!keyMappings) {
    logError({
      message: `No key mappings found for flowId: ${flowId}`,
      error: new Error("Missing key mappings"),
      meta: { flowId, availableFlowIds: Object.keys(UTILITY_FLOW_KEY_MAPPINGS) }
    });
    return {};
  }

  if (!actionSequence) {
    logError({
      message: `No action sequence found for originalFlowId: ${originalFlowId}`,
      error: new Error("Missing action sequence"),
      meta: { originalFlowId, availableFlows: Object.keys(FLOW_ACTION_SEQUENCES) }
    });
    return {};
  }

  const expectedKeyCount = Object.keys(keyMappings).length;
  logInfo({
    message: `Flow ${flowId} mapping details`,
    meta: {
      flowId,
      expectedKeyCount,
      receivedPayloadCount: payloads.length,
      actionSequence,
      keyMappings
    }
  });

  const result: Record<string, any> = {};

  // Group payloads by action for easy lookup
  const payloadsByAction = groupPayloadsByAction(payloads);
  
  logInfo({
    message: "Grouped payloads by action",
    meta: {
      flowId,
      originalFlowId,
      availableActions: Object.keys(payloadsByAction),
      actionCounts: Object.entries(payloadsByAction).reduce((counts, [action, payloads]) => {
        counts[action] = payloads.length;
        return counts;
      }, {} as Record<string, number>)
    }
  });




  // Fill in payload data using action-based matching
  Object.entries(keyMappings).forEach(([position, expectedKey]) => {
    logInfo({
      message: `Processing expected key: ${expectedKey}`,
      meta: { position, expectedKey, flowId }
    });

    // Handle catalog payloads first (positions 0 and 1)
    if (catalogPayloads && expectedKey === "search_full_catalog_refresh" && catalogPayloads.search) {
      result[expectedKey] = catalogPayloads.search.jsonRequest || {};
      logInfo({
        message: "Using catalog search payload for search_full_catalog_refresh",
        meta: { flowId, originalFlowId }
      });
    } else if (catalogPayloads && expectedKey === "on_search_full_catalog_refresh" && catalogPayloads.on_search) {
      result[expectedKey] = catalogPayloads.on_search.jsonRequest || {};
      logInfo({
        message: "Using catalog on_search payload for on_search_full_catalog_refresh",
        meta: { flowId, originalFlowId }
      });
    } else if (expectedKey.startsWith('on_status_')) {
      // Handle specific on_status keys by matching fulfillment state
      const statusPayload = findStatusPayload(payloadsByAction, expectedKey);
      result[expectedKey] = statusPayload.jsonRequest || {};
      logInfo({
        message: `Mapped on_status payload by fulfillment state`,
        meta: {
          expectedKey,
          expectedState: STATUS_KEY_MAPPING[expectedKey],
          found: !!statusPayload.jsonRequest
        }
      });
    } else if (expectedKey === 'cancel' || expectedKey === 'force_cancel') {
      // Handle cancel payloads with force parameter distinction
      const action = extractActionFromKey(expectedKey);
      const previousSameActions = Object.entries(keyMappings)
        .filter(([pos, key]) => parseInt(pos) < parseInt(position) && extractActionFromKey(key) === action)
        .length;
      
      const cancelPayload = findCancelPayload(payloadsByAction, expectedKey, previousSameActions);
      result[expectedKey] = cancelPayload.jsonRequest || {};
      
      logInfo({
        message: `Mapped cancel payload with force distinction`,
        meta: {
          expectedKey,
          action,
          forceValue: expectedKey === 'force_cancel' ? 'yes' : 'no',
          found: !!cancelPayload.jsonRequest
        }
      });
    } else {
      // Handle regular actions by matching context.action
      const action = extractActionFromKey(expectedKey);
      let actionIndex = 0;
      
      // For duplicate actions, calculate which occurrence this should be
      const previousSameKeys = Object.entries(keyMappings)
        .filter(([pos, key]) => parseInt(pos) < parseInt(position) && extractActionFromKey(key) === action)
        .length;
      actionIndex = previousSameKeys;
      
      const actionPayload = findPayloadByAction(payloadsByAction, action, actionIndex);
      result[expectedKey] = actionPayload.jsonRequest || {};
      
      logInfo({
        message: `Mapped payload by action`,
        meta: {
          expectedKey,
          action,
          actionIndex,
          found: !!actionPayload.jsonRequest
        }
      });
    }
  });

  // Check for missing payloads by looking at empty results
  const missingPayloads = Object.entries(result)
    .filter(([, value]) => !value || Object.keys(value).length === 0)
    .map(([key]) => ({
      expectedKey: key,
      expectedAction: extractActionFromKey(key),
      expectedState: key.startsWith('on_status_') ? STATUS_KEY_MAPPING[key] : null
    }));
  
  if (missingPayloads.length > 0) {
    logInfo({
      message: `[WARN] Missing payloads for flow ${flowId}`,
      meta: { flowId, missingPayloads }
    });
  }


  logInfo({
    message: "Final utility payload generated",
    meta: { flowId, payloadKeys: Object.keys(result) }
  });
  
  return result;
}
