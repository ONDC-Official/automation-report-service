import { FLOW_ID_MAP } from "./constants";

export interface TestItem {
  flow_id: string;
  transaction_id: string;
}

export function getNetworkParticipantId(sessionData: any): string | undefined {
  if (!sessionData?.payloads?.length) return undefined;
  for (const payload of sessionData.payloads) {
    if (sessionData.npType === "BPP") {
      if (payload.bppId && payload.bppId.trim() !== "") {
        return payload.bppId;
      }
    } else if (sessionData.npType === "BAP") {
      if (payload.bapId && payload.bapId.trim() !== "") {
        return payload.bapId;
      }
    }
  }

  // If none found
  return undefined;
}


export function generateTestsFromPayloads(sessionData: any): TestItem[] {
  const flowMap: Record<string, TestItem & { timestamp: string }> = {};

  for (const payload of sessionData.payloads) {
    const flowId = FLOW_ID_MAP[payload.flowId] || payload.flowId;
    const transactionId = payload.transactionId;
    const timestamp = payload.jsonRequest?.context?.timestamp;

    if (!timestamp) continue; 

    if (!flowMap[flowId]) {
      // First occurrence of this flowId
      flowMap[flowId] = { flow_id: flowId, transaction_id: transactionId, timestamp };
    } else if (flowMap[flowId].transaction_id !== transactionId) {
      // Flow already exists, pick the latest based on timestamp
      if (new Date(timestamp) > new Date(flowMap[flowId].timestamp)) {
        flowMap[flowId] = { flow_id: flowId, transaction_id: transactionId, timestamp };
      }
    }
  }

  // Convert map to array without the timestamp
  return Object.values(flowMap).map(({ flow_id, transaction_id }) => ({ flow_id, transaction_id }));
}

export function mapPayloadsToLogFormat(payloads: any): any[] {
  // Normalize to array
  let normalizedPayloads: any[] = [];

  if (Array.isArray(payloads)) {
    normalizedPayloads = payloads;
  } else if (payloads && Array.isArray(payloads.payloads)) {
    normalizedPayloads = payloads.payloads;
  } else if (payloads && typeof payloads === "object") {
    // Handle case where payloads might be an object of arrays (e.g. { flowA: [...], flowB: [...] })
    normalizedPayloads = Object.values(payloads).flatMap((v) =>
      Array.isArray(v) ? v : []
    );
    // If still empty, maybe it’s a single payload object
    if (normalizedPayloads.length === 0) normalizedPayloads = [payloads];
  }

  return normalizedPayloads.map((p) => ({
  request: p.jsonRequest ?? undefined,
  response: p.jsonResponse.response ?? undefined,
  action: p.action ? String(p.action).toLowerCase() : "",
  transaction_id: p.transactionId ?? undefined,
  message_id: p.messageId ?? undefined,
  created_at: p.createdAt ?? new Date(),
  updated_at: p.updatedAt ?? new Date(),
}));
}