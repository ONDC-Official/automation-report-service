import { fetchFlowData, saveFlowData } from "../utils/redisUtils";
import { extractBySpec, SaveSpec } from "../utils/extract";

export async function saveActionData(
  sessionId: string,
  flowId: string,
  transactionId: string,
  action: string,
  payload: any,
  spec: SaveSpec
): Promise<Record<string, any>> {
  const extracted = extractBySpec(payload, spec);
  await saveFlowData(sessionId, flowId, transactionId, action, extracted);
  return extracted;
}

export async function getActionData(
  sessionId: string,
  flowId: string,
  transactionId: string,
  action: string
): Promise<Record<string, any> | null> {
  return await fetchFlowData(sessionId, flowId, transactionId, action);
}

export function compareActionData(
  left: Record<string, any> | null,
  right: Record<string, any> | null
): { mismatches: string[] } {
  const mismatches: string[] = [];
  if (!left || !right)
    return { mismatches: ["One of the datasets is missing"] };
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const lv = left[key];
    const rv = right[key];
    if (JSON.stringify(lv) !== JSON.stringify(rv)) {
      mismatches.push(key);
    }
  }
  return { mismatches };
}

export function compareSelectVsOnSearch(
  select: any,
  onSearch: any
): { passed: string[]; failed: string[]; details: Record<string, any> } {
  const passed: string[] = [];
  const failed: string[] = [];
  const details: Record<string, any> = {};

  // Provider must exist in on_search
  const selectProviderId = select?.order?.provider?.id;
  const providerIds = Array.isArray(onSearch?.providers)
    ? onSearch.providers.map((p: any) => p?.id).filter(Boolean)
    : [onSearch.providers.id];

  if (selectProviderId && providerIds.includes(selectProviderId)) {
    passed.push("Provider exists in ON_SEARCH");
  } else {
    failed.push("Provider not found in ON_SEARCH");
    details.provider = { selectProviderId, providerIds };
  }

  // Items must exist in provider.items list
  const selectedItemIds: string[] = (select?.order?.items || [])
    .map((it: any) => it?.id)
    .filter(Boolean);
  const onSearchItemIds: string[] = Array.isArray(onSearch?.providers?.items)
    ? onSearch?.providers.items.map((it: any) => it?.id).filter(Boolean)
    : [];

  const missingItems = selectedItemIds.filter(
    (id) => !onSearchItemIds.includes(id)
  );
  if (missingItems.length === 0) {
    passed.push("All selected items exist in ON_SEARCH");
  } else {
    failed.push("Some selected items missing in ON_SEARCH");
    details.items = { selectedItemIds, onSearchItemIds, missingItems };
  }

  // Fulfillments must exist in provider.fulfillments (by id)
  const selectedFulfillmentIds: string[] = (select?.order?.fulfillments || [])
    .map((f: any) => f?.id)
    .filter(Boolean);
  const onSearchFulfillmentIds: string[] = 
        Array.isArray(onSearch?.providers?.fulfillments)
          ? onSearch?.providers.fulfillments.map((f: any) => f?.id).filter(Boolean)
          : [];
  const missingFulfillments = selectedFulfillmentIds.filter(
    (id) => !onSearchFulfillmentIds.includes(id)
  );
  if (missingFulfillments.length === 0) {
    passed.push("All selected fulfillments exist in ON_SEARCH");
  } else {
    failed.push("Some selected fulfillments missing in ON_SEARCH");
    details.fulfillments = {
      selectedFulfillmentIds,
      onSearchFulfillmentIds,
      missingFulfillments,
    };
  }

  return { passed, failed, details };
}
