import { Payload } from "../types/payload";
import logger from "@ondc/automation-logger";

/**
 * Extracts the best available timestamp for sorting:
 * 1. context.timestamp (protocol-canonical ordering)
 * 2. createdAt (DB insertion time, fallback)
 *
 * Using context.timestamp prevents BAP-side payload misordering where
 * requests (select, init) are inserted before their responses (on_select,
 * on_init) arrive, causing createdAt-based sorting to interleave them
 * incorrectly.
 */
function getSortTimestamp(p: Payload): number {
  const contextTs = p?.jsonRequest?.context?.timestamp;
  if (contextTs) {
    const ms = new Date(contextTs).getTime();
    if (!isNaN(ms)) return ms;
  }
  return new Date(p.createdAt).getTime();
}

// Function to sort payloads within each flowId group by context.timestamp (primary) or createdAt (fallback)
export function sortPayloadsByCreatedAt(
  grouped: Record<string, Payload[]>
): Record<string, Payload[]> {
  Object.keys(grouped).forEach((key) => {
    if (Array.isArray(grouped[key])) {
      grouped[key].sort(
        (a, b) => getSortTimestamp(a) - getSortTimestamp(b)
      );
    }
  });
  return grouped;
}

