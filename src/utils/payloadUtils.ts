import axios from "axios";
import { FLOW_ID_MAP } from "./constants";
import logger from "@ondc/automation-logger";
export interface TestItem {
  flow_id: string;
  transaction_id: string;
}

export async function generateTestsFromPayloads(
  domain: string,
  version: string,
  usecaseId: string,
  sessionId: string,
  flowIdToPayloadIdsMap: Record<string, string[]>
): Promise<{
  tests: TestItem[];
  subscriber_id: string;
}> {
  if (
    !FLOW_ID_MAP[domain] ||
    !FLOW_ID_MAP[domain][version] ||
    !FLOW_ID_MAP[domain][version][usecaseId]
  ) {
    logger.error(`Cannot find FLOW_ID_MAP configuration`, {
      domain,
      version,
      usecaseId,
      availableDomains: Object.keys(FLOW_ID_MAP),
      availableVersions: FLOW_ID_MAP[domain] ? Object.keys(FLOW_ID_MAP[domain]) : [],
      availableUsecases: FLOW_ID_MAP[domain]?.[version] ? Object.keys(FLOW_ID_MAP[domain][version]) : []
    });
    throw new Error("Cannot generate pramaan flows for this configuration");
  }

  const flowMappings = FLOW_ID_MAP[domain][version][usecaseId];
  const flowMap: Record<string, TestItem & { timestamp: string }> = {};
  const payloadIds = Object.values(flowIdToPayloadIdsMap).flat();
  const pramaanFlowIds = Object.keys(FLOW_ID_MAP[domain][version][usecaseId]);
  const response = await axios.get(
    `${process.env.DATA_BASE_URL}/api/sessions/payload/${sessionId}`,
    {
      headers: {
        "x-api-key": process.env.API_SERVICE_KEY,
      },
    }
  );

  const payloads = response.data;
  if (!payloads.length) {
    return { tests: [], subscriber_id: "" };
  }

  // Determine subscriber_id (consistent across payloads)
  const npType = payloads[0].npType;
  let subscriber_id = "";

  for (const entry of payloads) {
    const payload = entry.payload;
    if (!payloadIds.includes(payload.payloadId)) {
      continue;
    }
    if(!pramaanFlowIds.includes(payload.flowId)){
      continue;
    }
    if (!subscriber_id) {
      if (npType === "BPP" && payload.bppId) {
        subscriber_id = payload.bppId;
      } else if (npType === "BAP" && payload.bapId) {
        subscriber_id = payload.bapId;
      }
    }

    const mappedFlowId = flowMappings[payload.flowId];
    logger.info("Mapped Flow ID is", { flowId: mappedFlowId });
    if (!mappedFlowId) {
      throw new Error(
        `No flowId mapping found for ${payload.flowId} under ${domain} → ${version} → ${usecaseId}`
      );
    }
    const transactionId = payload.transactionId;
    const timestamp = payload.jsonRequest?.context?.timestamp;

    if (!timestamp) continue;

    if (
      !flowMap[mappedFlowId] ||
      new Date(timestamp) > new Date(flowMap[mappedFlowId].timestamp)
    ) {
      flowMap[mappedFlowId] = {
        flow_id: mappedFlowId,
        transaction_id: transactionId,
        timestamp,
      };
    }
  }

  const tests = Object.values(flowMap).map(({ flow_id, transaction_id }) => ({
    flow_id,
    transaction_id,
  }));

  return { tests, subscriber_id };
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
