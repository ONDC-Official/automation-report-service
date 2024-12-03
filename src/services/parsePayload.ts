import { Payload } from '../types/payload'
import { ParsedPayload } from '../types/parsedPayload'

export function parsePayload(transactionId: string, flow: string, payloads: Payload[]): ParsedPayload {
  // Initialize the parsed payload structure
  const parsedPayload: ParsedPayload = {
    domain: "ONDC:TRV11",
    version: "2.0.1",
    flow,
    payload: {
      search: {},
      on_search: {},
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
      on_cancel: {}
    }
  };

  // Group payloads by their `action`
  const groupedPayloads: { [key: string]: Payload[] } = payloads.reduce((groups, payload) => {
    const action = payload.action.toLowerCase()
    if (!groups[action]) {
      groups[action] = [];
    }
    groups[action].push(payload);
    return groups;
  }, {} as { [key: string]: Payload[] });

  // Process each group
  for (const [action, payloadGroup] of Object.entries(groupedPayloads)) {
    
    const normalizedAction = action.toLowerCase();

    if (!parsedPayload.payload.hasOwnProperty(normalizedAction)) {
      console.warn(`Unexpected payload type "${normalizedAction}" for transaction ID ${transactionId}`);
      continue;
    }

    // Sort the payloads by `created_at` timestamp
    const sortedPayloads = payloadGroup.sort((a, b) => {
      const timestampA = new Date(a.createdAt).getTime();
      const timestampB = new Date(b.createdAt).getTime();
      return timestampA - timestampB;
    });

    // Populate the parsed payload
    if (sortedPayloads.length === 1) {
      // Single payload goes directly into the base field (e.g., `search`)
      parsedPayload.payload[normalizedAction] = sortedPayloads[0].jsonObject;
    } else {
      // Multiple payloads are distributed into sequential fields (e.g., `search`, `search_1`, `search_2`)
      sortedPayloads.forEach((payload, index) => {
        const key = index === 0 ? normalizedAction : `${normalizedAction}_${index}`;
        parsedPayload.payload[key] = payload.jsonObject;
      });
    }
  }

  return parsedPayload;
}