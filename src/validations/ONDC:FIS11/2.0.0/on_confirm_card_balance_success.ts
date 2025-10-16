import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { getActionData } from "../../../services/actionDataService";

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result = await DomainValidators.fis11OnConfirmSuccess(element, sessionID, flowId, actionId);

  try {
    const message = element?.jsonRequest?.message;
    const order = message?.order;

    if (!order) {
      result.failed.push("Missing 'order' object in message");
      return result;
    }

    if (order?.status !== "COMPLETE") {
      result.failed.push(`Order status must be 'COMPLETE' but found '${order?.status}'`);
    } else {
      result.passed.push("Order status is COMPLETE");
    }

    if (order?.quote) {
      validateOrderQuote(message, result, {
        validateDecimalPlaces: true,
        validateTotalMatch: true,
        validateItemPriceConsistency: true,
        flowId,
      });
    } else {
      result.failed.push("Missing 'quote' in order");
    }

    if (!Array.isArray(order?.fulfillments) || order.fulfillments.length === 0) {
      result.failed.push("Missing 'fulfillments' array in order");
    } else {
      const fulfillment = order.fulfillments[0];

      if (!fulfillment?.id) result.failed.push("Missing 'id' in fulfillment");
      if (!fulfillment?.customer?.person?.name) result.failed.push("Missing customer name in fulfillment");
      if (!fulfillment?.customer?.contact?.phone) result.failed.push("Missing customer phone in fulfillment");
      if (!fulfillment?.state?.descriptor?.code) result.failed.push("Missing fulfillment state code");
      if (fulfillment?.state?.descriptor?.code !== "COMPLETED")
        result.failed.push(`Fulfillment state code must be 'COMPLETED' but found '${fulfillment?.state?.descriptor?.code}'`);
      else result.passed.push("Fulfillment state is COMPLETED");
    }

    // ✅ Validate Provider Info
    if (!order?.provider?.descriptor?.name)
      result.failed.push("Missing provider descriptor name in order");
    else result.passed.push(`Provider name: ${order?.provider?.descriptor?.name}`);

    // ✅ Validate Tags
    if (!Array.isArray(order?.tags) || order.tags.length === 0) {
      result.failed.push("Missing 'tags' array in order");
    } else {
      const bppTerms = order.tags.find((t: any) => t.descriptor?.code === "BPP_TERMS");
      const bapTerms = order.tags.find((t: any) => t.descriptor?.code === "BAP_TERMS");

      if (!bppTerms) result.failed.push("Missing BPP_TERMS tag");
      else result.passed.push("BPP_TERMS tag found");

      if (!bapTerms) result.failed.push("Missing BAP_TERMS tag");
      else result.passed.push("BAP_TERMS tag found");

      // Validate Settlement Fields
      if (bppTerms?.list) {
        const settlementType = bppTerms.list.find((l: any) => l.descriptor?.code === "SETTLEMENT_TYPE")?.value;
        const settlementAmount = bppTerms.list.find((l: any) => l.descriptor?.code === "SETTLEMENT_AMOUNT")?.value;
        const settlementWindow = bapTerms?.list?.find((l: any) => l.descriptor?.code === "SETTLEMENT_WINDOW")?.value;

        if (!settlementType) result.failed.push("Missing SETTLEMENT_TYPE under BPP_TERMS");
        if (!settlementAmount) result.failed.push("Missing SETTLEMENT_AMOUNT under BPP_TERMS");
        if (!settlementWindow) result.failed.push("Missing SETTLEMENT_WINDOW under BAP_TERMS");
        else result.passed.push(`Settlement window: ${settlementWindow}`);
      }
    }

    // ✅ Compare with CONFIRM data if available
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      const onConfirmMsg = element?.jsonRequest?.message;

      const onConfirmItems: any[] = onConfirmMsg?.order?.items || [];
      const confirmItems: any[] = Array.isArray(confirmData?.items) ? confirmData.items : [];
      const confirmPriceById = new Map<string, string>();
      for (const it of confirmItems) {
        if (it?.id && it?.price?.value !== undefined) {
          confirmPriceById.set(it.id, String(it.price.value));
        }
      }

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
    }
  } catch (err) {
    // 'err' is of type 'unknown' so we need to safely extract the message
    let errorMessage = 'Unknown error';
    if (err instanceof Error && err.message) {
      errorMessage = err.message;
    } else if (typeof err === "string") {
      errorMessage = err;
    }
    result.failed.push(`Unexpected error during validation: ${errorMessage}`);
  }

  return result;
}
