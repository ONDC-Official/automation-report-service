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

// ---------------------------------------------------------------------------
// Helpers: parse interest rate and tenure values
// ---------------------------------------------------------------------------

function parseRate(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace("%", "").trim());
  return isNaN(n) ? null : n;
}

function parseToMonths(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.toLowerCase().trim().match(/^(\d+(?:\.\d+)?)\s*(month|months|year|years)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  return match[2].startsWith("year") ? Math.round(num * 12) : num;
}

function extractTagValue(tags: any[], tagCode: string, fieldCode: string): string | undefined {
  if (!Array.isArray(tags)) return undefined;
  const tag = tags.find((t: any) => t?.descriptor?.code === tagCode);
  if (!tag) return undefined;
  const field = (tag.list || []).find((f: any) => f?.descriptor?.code === fieldCode);
  return field?.value;
}

function extractGeneralInfoLimits(onSearchData: Record<string, any> | null) {
  const empty = { minRate: null, maxRate: null, minTenureMonths: null, maxTenureMonths: null, minLoanAmount: null, maxLoanAmount: null } as
    { minRate: number | null; maxRate: number | null; minTenureMonths: number | null; maxTenureMonths: number | null; minLoanAmount: number | null; maxLoanAmount: number | null };
  if (!onSearchData) return empty;

  let tags: any[] = [];
  const providers: any[] =
    onSearchData?.providers ||
    onSearchData?.catalog?.providers ||
    onSearchData?.message?.catalog?.providers ||
    [];

  if (Array.isArray(providers) && providers.length) {
    tags = providers[0]?.items?.[0]?.tags || [];
  } else {
    tags = (onSearchData?.items || [])[0]?.tags || [];
  }

  return {
    minRate: parseRate(extractTagValue(tags, "GENERAL_INFO", "MIN_INTEREST_RATE")),
    maxRate: parseRate(extractTagValue(tags, "GENERAL_INFO", "MAX_INTEREST_RATE")),
    minTenureMonths: parseToMonths(extractTagValue(tags, "GENERAL_INFO", "MIN_TENURE")),
    maxTenureMonths: parseToMonths(extractTagValue(tags, "GENERAL_INFO", "MAX_TENURE")),
    minLoanAmount: parseFloat(extractTagValue(tags, "GENERAL_INFO", "MIN_LOAN_AMOUNT") || "NaN") || null,
    maxLoanAmount: parseFloat(extractTagValue(tags, "GENERAL_INFO", "MAX_LOAN_AMOUNT") || "NaN") || null,
  };
}

export function validateLoanInfoAgainstLimits(
  items: any[] | undefined,
  onSearchData: Record<string, any> | null
): { passed: string[]; failed: string[] } {
  const passed: string[] = [];
  const failed: string[] = [];
  if (!Array.isArray(items) || items.length === 0) return { passed, failed };

  const limits = extractGeneralInfoLimits(onSearchData);
  const hasLimits = Object.values(limits).some((v) => v !== null);
  if (!hasLimits) return { passed, failed };

  for (const item of items) {
    const tags: any[] = item?.tags || [];

    const rateStr = extractTagValue(tags, "LOAN_INFO", "INTEREST_RATE");
    if (rateStr !== undefined) {
      const rate = parseRate(rateStr);
      if (rate === null) {
        failed.push(`LOAN_INFO.INTEREST_RATE "${rateStr}" is not a valid percentage`);
      } else if (limits.minRate !== null && rate < limits.minRate) {
        failed.push(`LOAN_INFO.INTEREST_RATE ${rateStr} is below MIN_INTEREST_RATE (${limits.minRate}%)`);
      } else if (limits.maxRate !== null && rate > limits.maxRate) {
        failed.push(`LOAN_INFO.INTEREST_RATE ${rateStr} exceeds MAX_INTEREST_RATE (${limits.maxRate}%)`);
      } else {
        passed.push(`LOAN_INFO.INTEREST_RATE ${rateStr} is within on_search limits`);
      }
    }

    const termStr = extractTagValue(tags, "LOAN_INFO", "TERM");
    if (termStr !== undefined) {
      const termMonths = parseToMonths(termStr);
      if (termMonths === null) {
        failed.push(`LOAN_INFO.TERM "${termStr}" could not be parsed (expected e.g. "5 months" or "2 years")`);
      } else if (limits.minTenureMonths !== null && termMonths < limits.minTenureMonths) {
        failed.push(`LOAN_INFO.TERM "${termStr}" (${termMonths} months) is below MIN_TENURE (${limits.minTenureMonths} months)`);
      } else if (limits.maxTenureMonths !== null && termMonths > limits.maxTenureMonths) {
        failed.push(`LOAN_INFO.TERM "${termStr}" (${termMonths} months) exceeds MAX_TENURE (${limits.maxTenureMonths} months)`);
      } else {
        passed.push(`LOAN_INFO.TERM "${termStr}" is within on_search tenure limits`);
      }
    }

    const loanAmountStr = item?.price?.value;
    if (loanAmountStr !== undefined) {
      const loanAmount = parseFloat(String(loanAmountStr));
      if (!isNaN(loanAmount)) {
        if (limits.minLoanAmount !== null && loanAmount < limits.minLoanAmount) {
          failed.push(`Loan amount ${loanAmount} is below MIN_LOAN_AMOUNT (${limits.minLoanAmount})`);
        } else if (limits.maxLoanAmount !== null && loanAmount > limits.maxLoanAmount) {
          failed.push(`Loan amount ${loanAmount} exceeds MAX_LOAN_AMOUNT (${limits.maxLoanAmount})`);
        } else {
          passed.push(`Loan amount ${loanAmount} is within on_search limits`);
        }
      }
    }
  }

  return { passed, failed };
}


