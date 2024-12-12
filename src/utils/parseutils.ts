import { Payload } from '../types/payload';
import { ParsedPayload } from '../types/parsedPayload';

export async function parseFlows(flows: { [flowId: string]: Payload[] }): Promise<{ [flowId: string]: ParsedPayload }> {
  const parsedFlows: { [flowId: string]: ParsedPayload } = {};

  // Parse each flow's payloads and create parsed payloads
  for (const [flowId, flowPayloads] of Object.entries(flows)) {
    try {
      parsedFlows[flowId] = parsePayloads(flowId, flowPayloads);
    } catch (error) {
      console.error(`Error parsing flow ${flowId}:`, error);
      // Optionally handle invalid flows by adding an empty or error state.
      parsedFlows[flowId] = {
        domain: "ONDC:TRV11",
        version: "2.0.1",
        flow: flowId,
        payload: {},
      };
    }
  }

  return parsedFlows;
}

function parsePayloads(flowId: string, payloads: Payload[]): ParsedPayload {
  const parsedPayload: ParsedPayload = {
    domain: "ONDC:TRV11",
    version: "2.0.1",
    flow: flowId,
    payload: {
      // Initialize payload with all actions except search and on_search
      select: {},
      on_select: {},
      init: {},
      on_init: {},
      confirm: {},
      on_confirm: {},
      status: {},
      on_status: {},
      soft_cancel: {},
      soft_on_cancel: {},
      cancel: {},
      on_cancel: {},
    },
  };

  // Group payloads by their `action`
  const groupedPayloads: { [key: string]: Payload[] } = payloads.reduce((groups, payload) => {
    const action = payload.action?.toLowerCase();
    if (!action) {
      console.warn(`Missing action in payload for flow ID ${flowId}`, payload);
      return groups;
    }
    if (!groups[action]) {
      groups[action] = [];
    }
    groups[action].push(payload);
    return groups;
  }, {} as { [key: string]: Payload[] });

  // Collect all payloads in an array and sort by timestamp
  const allPayloads: Payload[] = [];
  for (const payloadGroup of Object.values(groupedPayloads)) {
    allPayloads.push(...payloadGroup);
  }

  // Sort all payloads based on timestamps
  allPayloads.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Separate non-empty payloads and empty payloads
  const nonEmptyPayloads: Payload[] = [];
  const emptyPayloads: Payload[] = [];

  allPayloads.forEach((payload, index) => {
    if (Object.keys(payload.jsonObject).length > 0) {
      nonEmptyPayloads.push(payload);
    } else {
      emptyPayloads.push(payload);
    }
  });

  // Populate parsedPayload with non-empty payloads first
  nonEmptyPayloads.forEach((payload, index) => {
    const action = payload.action?.toLowerCase();
    if (!action) {
      console.warn(`Missing action in payload for flow ID ${flowId}`, payload);
      return;
    }

    if (action === "search" || action === "on_search") {
      const key = `${action}_${index + 1}`; // Create numbered keys starting from 1
      parsedPayload.payload[key] = payload.jsonObject;
    } else {
      // If the action has been added before, append an index to make it unique
      const key = index === 0 ? action : `${action}_${index}`;
      parsedPayload.payload[key] = payload.jsonObject;
    }
  });

  // Add empty payloads at the end
  emptyPayloads.forEach((payload) => {
    const action = payload.action?.toLowerCase();
    if (!action) {
      console.warn(`Missing action in payload for flow ID ${flowId}`, payload);
      return;
    }
    parsedPayload.payload[action] = payload.jsonObject;
  });

  return parsedPayload;
}