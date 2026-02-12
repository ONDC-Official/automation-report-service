import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateStops, validateQuoteBreakup } from "./commonChecks";

export default async function on_search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.trv11OnSearch(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const catalog = message?.catalog;

    if (catalog?.providers && Array.isArray(catalog.providers)) {
      for (const provider of catalog.providers) {
        // Validate fulfillments
        if (provider.fulfillments && Array.isArray(provider.fulfillments)) {
          for (const f of provider.fulfillments) {
            // Validate TRIP and ROUTE type fulfillments have stops
            if ((f.type === "TRIP" || f.type === "ROUTE") && f.stops) {
              validateStops(f.stops, result, `on_search.provider[${provider.id}].fulfillment[${f.id}]`);
            }

            // Validate ROUTE_INFO tags
            if (f.tags && Array.isArray(f.tags)) {
              const routeInfo = f.tags.find((t: any) => t?.descriptor?.code === "ROUTE_INFO");
              if (routeInfo) {
                result.passed.push(
                  `on_search: fulfillment ${f.id} has ROUTE_INFO tag`
                );
              }
            }
          }
        }

        // Validate items have price (skip for PASS-linked items and MASTER TRIP items with > 2 stops)
        if (provider.items && Array.isArray(provider.items)) {
          const hasRouteFulfillmentOnly = (provider.fulfillments || []).length > 0 &&
            (provider.fulfillments || []).every((f: any) => f.type === "ROUTE");
          const passFulfillmentIds = new Set(
            (provider.fulfillments || [])
              .filter((f: any) => f.type === "PASS" || f.type === "ONLINE")
              .map((f: any) => f.id)
          );

          // Identify Master Trip fulfillments (TRIP type with more than 2 stops - implies network definition)
          const masterTripFulfillmentIds = new Set(
            (provider.fulfillments || [])
              .filter((f: any) => f.type === "TRIP" && (f.stops || []).length > 2)
              .map((f: any) => f.id)
          );

          // If this provider has Master Trip fulfillments, filter out shared validator errors for its items
          if (masterTripFulfillmentIds.size > 0) {
            provider.items.forEach((item: any, iIndex: number) => {
              const isMasterItem = item?.fulfillment_ids?.some((id: string) => masterTripFulfillmentIds.has(id));
              if (isMasterItem) {
                // Filter shared validator error: "Provider ${pIndex} Item ${iIndex}: price is missing"
                // We need the provider index (pIndex). Since `provider` is from `catalog.providers` loop...
                // But the loop is `for (const provider of catalog.providers)`. We don't have index directly.
                // Re-find index.
                const pIndex = catalog.providers.indexOf(provider);
                if (pIndex !== -1) {
                   const sharedError = `Provider ${pIndex} Item ${iIndex}: price is missing`;
                   const errIdx = result.failed.indexOf(sharedError);
                   if (errIdx !== -1) {
                     result.failed.splice(errIdx, 1);
                   }
                }
              }
            });
          }

          for (const item of provider.items) {
            const isPassItem = item?.fulfillment_ids?.some((id: string) => passFulfillmentIds.has(id));
            const isMasterItem = item?.fulfillment_ids?.some((id: string) => masterTripFulfillmentIds.has(id));
            
            if (!item?.price?.value && !item?.price?.minimum_value && !isPassItem && !hasRouteFulfillmentOnly && !isMasterItem) {
              result.failed.push(
                `on_search: item ${item?.id} missing price`
              );
            }
          }
        }

        // Validate payment modes
        if (provider.payments && Array.isArray(provider.payments)) {
          for (const payment of provider.payments) {
            if (payment.collected_by && !["BAP", "BPP"].includes(payment.collected_by)) {
              result.failed.push(
                `on_search: payment collected_by '${payment.collected_by}' invalid`
              );
            }
          }
        }
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
