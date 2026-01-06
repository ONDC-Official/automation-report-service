import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { HEALTH_INSURANCE_FLOWS } from "../../../utils/constants";
import { saveFromElement } from "../../../utils/specLoader";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  // For error response scenarios, validate error first

  // For normal on_confirm, use domain validator
  const result = await DomainValidators.fis13OnConfirm(element, sessionID, flowId, actionId, usecaseId);

  try {
    const message = element?.jsonRequest?.message;
    if (message?.order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: false,
        flowId,
      });
    }

    // Compare against CONFIRM request when available
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      const onConfirmMsg = element?.jsonRequest?.message;

      const onConfirmItems: any[] = onConfirmMsg?.order?.items || [];
      const confirmItems: any[] = confirmData?.items || [];
      const confirmPriceById = new Map<string, string>();
      for (const it of confirmItems) if (it?.id && it?.price?.value !== undefined) confirmPriceById.set(it.id, String(it.price.value));

      const missingFromConfirm: string[] = [];
      const priceMismatches: Array<{ id: string; confirm: string; on_confirm: string }> = [];
      for (const it of onConfirmItems) {
        const id = it?.id;
        if (!id) continue;
        if (!confirmPriceById.has(id)) {
          missingFromConfirm.push(id);
          continue;
        }
        const cnf = parseFloat(confirmPriceById.get(id) as string);
        const onCnf = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(cnf) && !Number.isNaN(onCnf)) {
          if (cnf === onCnf) result.passed.push(`Item '${id}' price matches CONFIRM`);
          else priceMismatches.push({ id, confirm: String(cnf), on_confirm: String(onCnf) });
        }
      }
      if (priceMismatches.length) result.failed.push("Item price mismatches between CONFIRM and on_confirm");
      if (missingFromConfirm.length || priceMismatches.length) {
        (result.response as any) = {
          ...(result.response || {}),
          on_confirm_vs_confirm: { missingFromConfirm, priceMismatches },
        };
      }
      
      // Validate form ID consistency if xinput is present
      if (flowId && HEALTH_INSURANCE_FLOWS.includes(flowId)) {
        await validateFormIdIfXinputPresent(onConfirmMsg, sessionID, flowId, txnId, "on_confirm", result, HEALTH_INSURANCE_FLOWS);
      }
    }

    // Validate settlement amount calculation for health insurance flows
    // if (flowId && HEALTH_INSURANCE_FLOWS.includes(flowId)) {
    //   const order = message?.order;
    //   if (order?.payments && Array.isArray(order.payments)) {
    //     order.payments.forEach((payment: any, paymentIndex: number) => {
    //       // Validate SETTLEMENT_AMOUNT calculation for BAP_TERMS and BPP_TERMS
    //       validateSettlementAmount(
    //         payment,
    //         paymentIndex,
    //         order,
    //         result,
    //         "BAP_TERMS"
    //       );
    //       validateSettlementAmount(
    //         payment,
    //         paymentIndex,
    //         order,
    //         result,
    //         "BPP_TERMS"
    //       );
    //     });
    //   }
    // }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}

