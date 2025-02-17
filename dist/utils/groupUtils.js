"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupAndSortPayloadsByFlowId = groupAndSortPayloadsByFlowId;
// Function to group payloads by flowId and sort within each group by createdAt
function groupAndSortPayloadsByFlowId(payloads) {
    return payloads.reduce((grouped, element) => {
        const { flowId } = element.payload;
        // Initialize the group if not already present
        if (!grouped[flowId]) {
            grouped[flowId] = [];
        }
        // Push payload to the respective flowId group
        grouped[flowId].push(element);
        // Sort the group by createdAt timestamp
        grouped[flowId].sort((a, b) => new Date(a.payload.createdAt).getTime() - new Date(b.payload.createdAt).getTime());
        return grouped;
    }, {});
}
