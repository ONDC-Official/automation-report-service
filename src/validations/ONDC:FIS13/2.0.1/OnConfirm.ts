import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { saveFromElement } from "../../../utils/specLoader";
import {
  validateInsuranceContext,
  validateInsuranceOrderStatus,
  validateInsuranceDocuments,
  validateInsurancePaymentParams,
  validateInsuranceOrderId,
} from "../../shared/healthInsuranceValidations";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis13OnConfirm(element, sessionID, flowId, actionId, usecaseId);

  try {
    const context = element?.jsonRequest?.context;
    const message = element?.jsonRequest?.message;

    // Health insurance domain checks
    validateInsuranceContext(context, result, flowId);
    if (message) validateInsuranceOrderStatus(message, result, flowId);
    if (message) validateInsuranceOrderId(message, result, flowId);
    if (message) validateInsuranceDocuments(message, result, flowId);
    if (message) validateInsurancePaymentParams(message, result, flowId, actionId);

    // Quote calculation check
    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
    }

    const txnId = context?.transaction_id as string | undefined;
    if (txnId) {
      // Price comparison: confirm → on_confirm
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      const onConfirmItems: any[] = message?.order?.items || [];
      const confirmItems: any[] = confirmData?.items || [];
      const confirmPriceById = new Map<string, string>();
      for (const it of confirmItems) {
        if (it?.id && it?.price?.value !== undefined) confirmPriceById.set(it.id, String(it.price.value));
      }

      const missingFromConfirm: string[] = [];
      const priceMismatches: Array<{ id: string; confirm: string; on_confirm: string }> = [];
      for (const it of onConfirmItems) {
        const id = it?.id;
        if (!id) continue;
        if (!confirmPriceById.has(id)) { missingFromConfirm.push(id); continue; }
        const cnf = parseFloat(confirmPriceById.get(id) as string);
        const onCnf = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(cnf) && !Number.isNaN(onCnf)) {
          if (cnf === onCnf) result.passed.push(`Item '${id}' price matches CONFIRM`);
          else priceMismatches.push({ id, confirm: String(cnf), on_confirm: String(onCnf) });
        }
      }
      if (priceMismatches.length) result.failed.push("Item price mismatches between CONFIRM and on_confirm");
      if (missingFromConfirm.length || priceMismatches.length) {
        (result.response as any) = { ...(result.response || {}), on_confirm_vs_confirm: { missingFromConfirm, priceMismatches } };
      }

      // Form ID (xinput) check
      await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_confirm", result);
    }
  } catch (_) { }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
