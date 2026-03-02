import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateGpsFormat, validateStops } from "./commonChecks";

export default async function search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11Search210(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const intent = message?.intent;

    if (!intent) {
      result.failed.push("search: intent is missing");
    } else {
      // Validate fulfillment
      const fulfillment = intent?.fulfillment;
      if (!fulfillment) {
        result.failed.push("search: intent.fulfillment is missing");
      } else {
        // Validate vehicle.category
        const category = fulfillment?.vehicle?.category;
        if (!category) {
          result.failed.push("search: vehicle.category is missing");
        } else if (["METRO", "BUS"].includes(category)) {
          result.passed.push(`search: vehicle.category '${category}' is valid`);
        } else {
          result.failed.push(`search: vehicle.category '${category}' must be METRO or BUS`);
        }

        // Validate stops (optional for master/broad search)
        if (fulfillment.stops && Array.isArray(fulfillment.stops) && fulfillment.stops.length > 0) {
          validateStops(fulfillment.stops, result, "search.intent.fulfillment");

          for (const stop of fulfillment.stops) {
            if (stop?.location?.gps) {
              validateGpsFormat(stop.location.gps, `search.stop[${stop.type}]`, result);
            }
          }

          // Check START/END stops
          const hasStart = fulfillment.stops.some((s: any) => s.type === "START");
          const hasEnd = fulfillment.stops.some((s: any) => s.type === "END");
          if (!hasStart) result.failed.push("search: at least one START stop is required");
          if (!hasEnd) result.failed.push("search: at least one END stop is required");
        } else {
          result.passed.push("search: no stops present (broad/master search)");
        }
      }

      // Validate payment
      const payment = intent?.payment;
      if (!payment) {
        result.failed.push("search: intent.payment is missing");
      } else {
        if (!payment.collected_by) {
          result.failed.push("search: payment.collected_by is missing");
        } else if (["BAP", "BPP"].includes(payment.collected_by)) {
          result.passed.push(`search: payment.collected_by '${payment.collected_by}' is valid`);
        } else {
          result.failed.push(`search: payment.collected_by '${payment.collected_by}' must be BAP or BPP`);
        }
      }

      // 2.1.0: BAP_TERMS in intent.tags (replaces payment.tags BUYER_FINDER_FEES/SETTLEMENT_TERMS)
      const tags = intent?.tags;
      if (!tags || !Array.isArray(tags)) {
        result.failed.push("search: intent.tags is missing (BAP_TERMS expected)");
      } else {
        const bapTerms = tags.find((t: any) => t?.descriptor?.code === "BAP_TERMS");
        if (!bapTerms) {
          result.failed.push("search: BAP_TERMS tag missing in intent.tags");
        } else {
          result.passed.push("search: BAP_TERMS tag present in intent.tags");
          const list = bapTerms.list;
          if (list && Array.isArray(list)) {
            const bffPct = list.find((l: any) => l?.descriptor?.code === "BUYER_FINDER_FEES_PERCENTAGE");
            if (!bffPct?.value) {
              result.failed.push("search: BUYER_FINDER_FEES_PERCENTAGE missing in BAP_TERMS");
            } else {
              result.passed.push(`search: BUYER_FINDER_FEES_PERCENTAGE is ${bffPct.value}`);
            }
          }
        }
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
