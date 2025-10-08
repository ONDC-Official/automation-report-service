export interface TestItem {
  flow_id: string;
  transaction_id: string;
}

export function getNetworkParticipantId(sessionData: any): string | undefined {
  if (!sessionData?.payloads?.length) return undefined;

  for (const payload of sessionData.payloads) {
    if (sessionData.npType === "BPP") {
      if (payload.bpp_id && payload.bpp_id.trim() !== "") {
        return payload.bpp_id;
      }
    } else if (sessionData.npType === "BAP") {
      if (payload.bap_id && payload.bap_id.trim() !== "") {
        return payload.bap_id;
      }
    }
  }

  // If none found
  return undefined;
}


export function generateTestsFromPayloads(sessionData: any): TestItem[] {
  const flowMap: Record<string, TestItem & { timestamp: string }> = {};

  for (const payload of sessionData.payloads) {
    const flowId = payload.flowId;
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

export function mapPayloadsToLogFormat(payloads: any[]): any[] {
  return payloads.map((p) => ({
    request: p.jsonRequest ?? undefined,
    response: p.jsonResponse ?? undefined,
    action: p.action ?? "",
    transaction_id: p.transactionId ?? undefined,
    message_id: p.messageId ?? undefined,
    created_at: p.createdAt ?? new Date(),
    updated_at: p.updatedAt ?? new Date(),
  }));
}