import { logInfo, logError } from "../utils/logger";
import * as fs from "fs";
import * as path from "path";

// Helper function to save debug data to file
function saveDebugData(filename: string, data: any, directory: string = 'debug'): void {
  try {
    const debugPath = path.join(process.cwd(), directory);
    if (!fs.existsSync(debugPath)) {
      fs.mkdirSync(debugPath, { recursive: true });
    }
    fs.writeFileSync(
      path.join(debugPath, filename), 
      JSON.stringify(data, null, 2)
    );
    logInfo({
      message: `Debug data saved to ${directory}/${filename}`,
      meta: { filename, directory }
    });
  } catch (error) {
    logError({
      message: 'Failed to save debug data',
      error,
      meta: { filename, directory }
    });
  }
}

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

// Function to generate debug summary report
export function generateDebugSummary(): void {
  try {
    // Only generate summary in debug mode
    if (process.env.DEBUG_MODE !== 'true') {
      return;
    }
    const debugPath = path.join(process.cwd(), 'debug');
    const mappingsPath = path.join(debugPath, 'mappings');
    const diagnosticsPath = path.join(debugPath, 'diagnostics');
    
    if (!fs.existsSync(mappingsPath) || !fs.existsSync(diagnosticsPath)) {
      logInfo({ message: 'No debug data found to generate summary' });
      return;
    }

    const summary: any = {
      generatedAt: new Date().toISOString(),
      flows: {},
      overallStats: {
        totalFlows: 0,
        totalMissingPayloads: 0,
        commonMissingKeys: {},
        commonMissingStates: {}
      }
    };

    // Read all mapping result files
    const mappingFiles = fs.readdirSync(mappingsPath)
      .filter(f => f.endsWith('_mapping_results.json'));
    
    mappingFiles.forEach(file => {
      const data = JSON.parse(fs.readFileSync(path.join(mappingsPath, file), 'utf-8'));
      const flowKey = `${data.flowId}_${data.originalFlowId}`;
      
      summary.flows[flowKey] = {
        flowId: data.flowId,
        originalFlowId: data.originalFlowId,
        timestamp: data.timestamp,
        successRate: data.successRate,
        summary: data.summary,
        missingKeys: data.missingPayloads.map((m: any) => m.expectedKey)
      };
      
      summary.overallStats.totalFlows++;
      summary.overallStats.totalMissingPayloads += data.missingCount;
      
      // Track common missing keys
      data.missingPayloads.forEach((missing: any) => {
        const key = missing.expectedKey;
        summary.overallStats.commonMissingKeys[key] = 
          (summary.overallStats.commonMissingKeys[key] || 0) + 1;
        
        if (missing.expectedState) {
          summary.overallStats.commonMissingStates[missing.expectedState] = 
            (summary.overallStats.commonMissingStates[missing.expectedState] || 0) + 1;
        }
      });
    });

    // Read status analysis files for more insights
    const statusFiles = fs.readdirSync(diagnosticsPath)
      .filter(f => f.endsWith('_on_status_analysis.json'));
    
    statusFiles.forEach(file => {
      const data = JSON.parse(fs.readFileSync(path.join(diagnosticsPath, file), 'utf-8'));
      const flowKey = data.flowId;
      
      if (summary.flows[flowKey]) {
        summary.flows[flowKey].statusAnalysis = {
          foundStates: data.foundStates,
          missingStates: data.missingStates.map((s: any) => s.state)
        };
      }
    });

    // Sort common missing keys by frequency
    summary.overallStats.commonMissingKeys = Object.entries(summary.overallStats.commonMissingKeys)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .reduce((acc, [key, count]) => ({ ...acc, [key]: count }), {});
    
    summary.overallStats.commonMissingStates = Object.entries(summary.overallStats.commonMissingStates)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .reduce((acc, [state, count]) => ({ ...acc, [state]: count }), {});

    // Save summary
    saveDebugData('debug_summary.json', summary);
    
    logInfo({
      message: 'Debug summary generated',
      meta: {
        totalFlows: summary.overallStats.totalFlows,
        totalMissingPayloads: summary.overallStats.totalMissingPayloads
      }
    });
  } catch (error) {
    logError({
      message: 'Failed to generate debug summary',
      error
    });
  }
}

export function getUtilityFlowPayload(
  flowId: string,
  originalFlowId: string,
  payloads: any[],
  catalogPayloads?: any
): Record<string, any> {
  // Check if debug mode is enabled via environment variable
  const debugMode = process.env.DEBUG_MODE === 'true';
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

  // Initialize all expected keys with empty objects
  Object.values(keyMappings).forEach((key) => {
    result[key] = {};
  });

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

  // Save raw payload analysis only in debug mode
  if (debugMode) {
    saveDebugData(`payloads/${flowId}_${originalFlowId}_raw.json`, {
    flowId,
    originalFlowId,
    timestamp: new Date().toISOString(),
    payloadCount: payloads.length,
    payloadsByAction: Object.entries(payloadsByAction).reduce((acc, [action, actionPayloads]) => {
      acc[action] = actionPayloads.map(p => ({
        timestamp: p.jsonRequest?.context?.timestamp,
        message_id: p.jsonRequest?.context?.message_id,
        transaction_id: p.jsonRequest?.context?.transaction_id,
        order_id: p.jsonRequest?.message?.order_id,
        action: p.jsonRequest?.context?.action
      }));
      return acc;
    }, {} as Record<string, any[]>),
    actionCounts: Object.entries(payloadsByAction).reduce((counts, [action, payloads]) => {
      counts[action] = payloads.length;
      return counts;
    }, {} as Record<string, number>),
    allActions: Object.keys(payloadsByAction)
    });
  }

  // Save on_status analysis only in debug mode
  if (debugMode && payloadsByAction['on_status']) {
    const statusAnalysis = payloadsByAction['on_status'].map(p => ({
      timestamp: p.jsonRequest?.context?.timestamp,
      fulfillmentState: extractFulfillmentState(p.jsonRequest),
      fulfillmentId: p.jsonRequest?.message?.order?.fulfillments?.[0]?.id,
      orderId: p.jsonRequest?.message?.order_id,
      orderState: p.jsonRequest?.message?.order?.state,
      fullPath: 'message.order.fulfillments[0].state.descriptor.code',
      rawFulfillment: p.jsonRequest?.message?.order?.fulfillments?.[0]
    }));
    
    saveDebugData(`diagnostics/${flowId}_on_status_analysis.json`, {
      flowId,
      statusPayloadCount: statusAnalysis.length,
      statusPayloads: statusAnalysis,
      expectedStates: Object.entries(keyMappings)
        .filter(([, key]) => key.startsWith('on_status_'))
        .map(([position, key]) => ({ 
          position, 
          key, 
          expectedState: STATUS_KEY_MAPPING[key] 
        })),
      foundStates: [...new Set(statusAnalysis.map(s => s.fulfillmentState))],
      missingStates: Object.entries(STATUS_KEY_MAPPING)
        .filter(([key]) => Object.values(keyMappings).includes(key))
        .filter(([, state]) => !statusAnalysis.some(s => s.fulfillmentState === state))
        .map(([key, state]) => ({ key, state }))
    });
  }

  // Save cancel analysis only in debug mode
  if (debugMode && payloadsByAction['cancel']) {
    const cancelAnalysis = payloadsByAction['cancel'].map(p => ({
      timestamp: p.jsonRequest?.context?.timestamp,
      forceParam: extractForceParameter(p.jsonRequest),
      orderId: p.jsonRequest?.message?.order_id,
      cancellationReasonId: p.jsonRequest?.message?.cancellation_reason_id,
      descriptorName: p.jsonRequest?.message?.descriptor?.name,
      descriptorShortDesc: p.jsonRequest?.message?.descriptor?.short_desc,
      tags: p.jsonRequest?.message?.descriptor?.tags,
      fullPath: 'message.descriptor.tags[].list[].code=force',
      rawDescriptor: p.jsonRequest?.message?.descriptor
    }));
    
    saveDebugData(`diagnostics/${flowId}_cancel_analysis.json`, {
      flowId,
      cancelPayloadCount: cancelAnalysis.length,
      cancelPayloads: cancelAnalysis,
      expectedCancelKeys: Object.entries(keyMappings)
        .filter(([, key]) => key === 'cancel' || key === 'force_cancel')
        .map(([position, key]) => ({ position, key })),
      hasForceNo: cancelAnalysis.some(c => c.forceParam === 'no'),
      hasForceYes: cancelAnalysis.some(c => c.forceParam === 'yes')
    });
  }

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

  // Save final mapping results only in debug mode
  if (debugMode) {
    const mappingResults = {
    flowId,
    originalFlowId,
    timestamp: new Date().toISOString(),
    expectedKeys: Object.values(keyMappings),
    totalExpectedKeys: Object.keys(keyMappings).length,
    mappingResults: Object.entries(result).map(([key, value]) => ({
      key,
      hasPayload: !!value && Object.keys(value).length > 0,
      payloadKeys: Object.keys(value || {}),
      isEmpty: !value || Object.keys(value).length === 0
    })),
    missingPayloads,
    missingCount: missingPayloads.length,
    successRate: `${((Object.keys(keyMappings).length - missingPayloads.length) / Object.keys(keyMappings).length * 100).toFixed(2)}%`,
    summary: {
      totalExpected: Object.keys(keyMappings).length,
      totalFound: Object.keys(keyMappings).length - missingPayloads.length,
      totalMissing: missingPayloads.length,
      missingKeys: missingPayloads.map(m => m.expectedKey)
    }
  };
    
    saveDebugData(`mappings/${flowId}_mapping_results.json`, mappingResults);
  }

  logInfo({
    message: "Final utility payload generated",
    meta: { flowId, payloadKeys: Object.keys(result) }
  });
  
  return result;
}
