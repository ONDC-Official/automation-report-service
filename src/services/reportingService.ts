import { ParsedPayload } from '../types/parsedPayload';

export function generateReport(
  validatedFlows: { flowId: string; isValid: boolean; parsedPayloads: ParsedPayload[] }[]
) {
  return validatedFlows.map(({ flowId, isValid, parsedPayloads }) => ({
    flowId,
    status: isValid ? 'Valid' : 'Invalid',
    transactions: parsedPayloads,
  }));
}