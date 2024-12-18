import { Payload } from "../types/payload";

// Function to group payloads by flowId and sort within each group by createdAt
export function groupAndSortPayloadsByFlowId(payloads: Payload[]): Record<string, Payload[]> {
  return payloads.reduce((grouped, payload) => {
    const { flowId } = payload;

    // Initialize the group if not already present
    if (!grouped[flowId]) {
      grouped[flowId] = [];
    }

    // Push payload to the respective flowId group
    grouped[flowId].push(payload);

    // Sort the group by createdAt timestamp
    grouped[flowId].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return grouped;
  }, {} as Record<string, Payload[]>);
}

