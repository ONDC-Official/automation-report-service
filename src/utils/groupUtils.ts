import { Payload } from '../types/payload';

export function groupPayloadsByFlowId(payloads: Payload[]): { [flowId: string]: Payload[] } {
  return payloads.reduce((grouped, payload) => {
    const { flowId } = payload;
    if (!grouped[flowId]) {
      grouped[flowId] = [];
    }
    grouped[flowId].push(payload);
    return grouped;
  }, {} as { [flowId: string]: Payload[] });
}

export function groupPayloadsByTransactionId(payloads: Payload[]): { [transactionId: string]: Payload[] } {
  return payloads.reduce((grouped, payload) => {
    const { transactionId } = payload;
    if (!grouped[transactionId]) {
      grouped[transactionId] = [];
    }
    grouped[transactionId].push(payload);
    return grouped;
  }, {} as { [transactionId: string]: Payload[] });
}