import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote, validateFIS12LoanQuote } from "../../shared/quoteValidations";
import { getActionData, validateLoanInfoAgainstLimits } from "../../../services/actionDataService";
import { saveFromElement } from "../../../utils/specLoader";

export default async function on_select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12OnSelect(element, sessionID, flowId, actionId, usecaseId);

  try {
    const message = element?.jsonRequest?.message;
    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: false, // FIS12 uses NET_DISBURSED_AMOUNT exclusion — handled by validateFIS12LoanQuote
        validateItemPriceConsistency: false,
        flowId,
      });
      // FIS12 loan-specific quote checks: required titles, total sum, NET_DISBURSED_AMOUNT formula
      validateFIS12LoanQuote(message, result);
    }

    // Compare item ids and prices with prior SELECT request if available
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const selectData = await getActionData(sessionID, flowId, txnId, "select");
      const selItems: any[] = selectData?.order?.items || [];
      const onSelItems: any[] = message?.order?.items || [];

      // Build price map from SELECT
      const selectPriceById = new Map<string, string>();
      for (const it of selItems) {
        if (it?.id && it?.price?.value !== undefined) {
          selectPriceById.set(it.id, String(it.price.value));
        }
      }

      const missingInSelect: string[] = [];
      const priceMismatches: Array<{ id: string; select: string; on_select: string }> = [];
      for (const it of onSelItems) {
        const id: string | undefined = it?.id;
        if (!id) continue;
        if (!selectPriceById.has(id)) {
          missingInSelect.push(id);
          continue;
        }
        const selPrice = parseFloat(selectPriceById.get(id) as string);
        const onSelPrice = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(selPrice) && !Number.isNaN(onSelPrice)) {
          if (selPrice === onSelPrice) {
            result.passed.push(`Item '${id}' price matches SELECT`);
          } else {
            priceMismatches.push({ id, select: String(selPrice), on_select: String(onSelPrice) });
          }
        }
      }

      if (priceMismatches.length) {
        result.failed.push("Item price mismatches between SELECT and on_select");
        (result.response as any) = {
          ...(result.response || {}),
          on_select_vs_select: {
            ...(result.response as any)?.on_select_vs_select,
            priceMismatches,
          },
        };
      }

      // Validate on_select LOAN_INFO terms are within on_search GENERAL_INFO limits
      const onSearchData = await getActionData(sessionID, flowId, txnId, "on_search");
      const loanLimitCheck = validateLoanInfoAgainstLimits(
        message?.order?.items,
        onSearchData
      );
      result.passed.push(...loanLimitCheck.passed);
      result.failed.push(...loanLimitCheck.failed);
    }
  } catch (_) { }
  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}