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
  const result = await DomainValidators.trv11Search(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const intent = message?.intent;

    // Validate payment.collected_by
    if (intent?.payment?.collected_by) {
      const collectedBy = intent.payment.collected_by;
      if (["BAP", "BPP"].includes(collectedBy)) {
        result.passed.push(`search: payment.collected_by '${collectedBy}' is valid`);
      } else {
        result.failed.push(`search: payment.collected_by '${collectedBy}' must be BAP or BPP`);
      }
    }

    // Validate fulfillment stops
    const fulfillment = intent?.fulfillment;
    if (fulfillment?.stops) {
      validateStops(fulfillment.stops, result, "search.intent.fulfillment");

      // GPS-based search: stops with location.gps instead of descriptor.code
      for (const stop of fulfillment.stops) {
        if (stop?.location?.gps) {
          validateGpsFormat(stop.location.gps, `search.stop[${stop.type}]`, result);
        }
      }
    }

    // Validate vehicle.category
    if (fulfillment?.vehicle?.category) {
      if (fulfillment.vehicle.category === "METRO") {
        result.passed.push("search: vehicle.category is METRO");
      }
    }

    // Validate intent.tags for BAP_TERMS (2.1.0 specific - tags in intent)
    if (intent?.tags && Array.isArray(intent.tags)) {
      const bapTerms = intent.tags.find((t: any) => t?.descriptor?.code === "BAP_TERMS");
      if (bapTerms) {
        result.passed.push("search: BAP_TERMS tag present in intent.tags");
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
