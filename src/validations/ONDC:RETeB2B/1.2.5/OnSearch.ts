import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateItemPricing } from "./commonChecks";
import {
  validateOrderValueTag,
  validateTimingTags,
  validateServiceabilityCategories,
  validateBrandImagesConsistency,
  validateRetailerInfoRequiredTags,
  validateVariantGroupConsistency,
  validateFulfillmentReferences,
  validateProviderIdentity,
  validateItemQuantityBounds,
  validatePackConfig,
  validateConsumerCareContact,
  validateP2PDescriptor,
  reportCatalogShape,
} from "./onSearchB2BChecks";
import {
  validateOnSearchContext,
  validateBppDescriptorTerms,
  validateProviderUniqueness,
  validateProviderTimestamps,
  validateProviderEntityUniqueness,
  validateProviderLocations,
  validateFulfillmentContacts,
  validateCategoryTags,
  validateServiceabilityConstructs,
  validateServiceabilityCoverage,
  validateOrderTimingPresence,
  validateItemDescriptors,
  validateItemLocationRefs,
  validateItemPriceBounds,
  validateItemMaximumCount,
  validateMandatoryItemTags,
  validateReplacementTerms,
  validateItemStatutoryFields,
  validateOffers,
} from "./onSearchRetailChecks";

// Only Discovery_flow_broadcast_search disambiguates its two on_search legs by
// action_id (search-0 / on_search / search-1 / on_search-1). The other eight
// RETeB2B flows have a single, undisambiguated on_search step, so the deep path
// and the strict action_id check below must stay scoped to this flow.
const FLOW_DISCOVERY_BROADCAST = "Discovery_flow_broadcast_search";
const ACTION_ID_BROADCAST = "on_search";
const ACTION_ID_P2P = "on_search-1";

export default async function on_search(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.retEB2BOnSearch(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;

    if (flowId === FLOW_DISCOVERY_BROADCAST) {
      if (actionId === ACTION_ID_BROADCAST) {
        validateBroadcastCatalog(element, message, result);
      } else if (actionId === ACTION_ID_P2P) {
        validateP2PDescriptor(message?.catalog?.["bpp/descriptor"], result);
      } else {
        result.failed.push(
          `on_search: unexpected action_id '${actionId}' for flow '${flowId}' — expected '${ACTION_ID_BROADCAST}' or '${ACTION_ID_P2P}'`
        );
      }
    } else {
      validateCatalogStructure(message, result);
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}

function validateBroadcastCatalog(element: Payload, message: any, result: TestResult): void {
  // A NACK carries context + error and no catalog; validating it would report a
  // pile of irrelevant missing-field failures.
  if (element?.jsonRequest?.error && Object.keys(element.jsonRequest.error).length > 0) {
    result.passed.push("on_search: NACK response — skipping catalog validation");
    return;
  }

  const context = element?.jsonRequest?.context;
  const catalog = message?.catalog;
  const providers = catalog?.["bpp/providers"];

  // Without this the whole catalog block would return silently, producing neither
  // a pass nor a failure — which reads as "the validator never ran".
  if (!providers || !Array.isArray(providers) || providers.length === 0) {
    result.failed.push("on_search: catalog['bpp/providers'] must be a non-empty array");
    return;
  }

  reportCatalogShape(catalog, result);
  validateOnSearchContext(context, result);
  validateBppDescriptorTerms(catalog, result);
  validateProviderUniqueness(providers, result);

  const catalogFulfillments = catalog?.["bpp/fulfillments"];

  for (const provider of providers) {
    validateProviderIdentity(provider, result);
    validateProviderTimestamps(provider, context?.timestamp, result);
    validateProviderEntityUniqueness(provider, result);
    validateProviderLocations(provider, context?.timestamp, result);
    validateFulfillmentContacts(provider, result);
    validateCategoryTags(provider, result);

    validateOrderValueTag(provider, result);
    validateTimingTags(provider, result);
    validateOrderTimingPresence(provider, result);
    validateServiceabilityCategories(provider, result);
    validateServiceabilityConstructs(provider, result);
    validateServiceabilityCoverage(provider, result);
    validateBrandImagesConsistency(provider, result);
    validateRetailerInfoRequiredTags(provider, result);
    validateVariantGroupConsistency(provider, result);
    validateFulfillmentReferences(provider, catalogFulfillments, result);
    validateItemLocationRefs(provider, result);
    validateOffers(provider, result);

    validateItemPricing(provider?.items, result, "on_search");
    validateItemDescriptors(provider?.items, result);
    validateItemQuantityBounds(provider?.items, result);
    validateItemMaximumCount(provider?.items, result);
    validateItemPriceBounds(provider?.items, result);
    validatePackConfig(provider?.items, result);
    validateMandatoryItemTags(provider?.items, result);
    validateReplacementTerms(provider?.items, result);
    validateItemStatutoryFields(provider?.items, result);
    validateConsumerCareContact(provider?.items, result);
  }
}

function validateCatalogStructure(message: any, result: TestResult): void {
  const providers = message?.catalog?.["bpp/providers"];

  if (!providers || !Array.isArray(providers) || providers.length === 0) {
    result.failed.push("on_search: catalog['bpp/providers'] must be a non-empty array");
    return;
  }

  for (const provider of providers) {
    validateItemPricing(provider?.items, result, "on_search");
  }
}
