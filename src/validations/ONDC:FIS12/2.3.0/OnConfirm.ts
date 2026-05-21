import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { saveFromElement } from "../../../utils/specLoader";
import { UNIFIED_CREDIT_FLOWS } from "../../../utils/constants";

const VALID_ORDER_STATUSES = ["ACTIVE", "COMPLETE", "CANCELLED"];

/**
 * Validate on_confirm order for unified credit flows.
 * Per doc: lender returns order with status ACTIVE, provider info, fulfillments, and payments.
 */
function validateUnifiedCreditOnConfirm(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("on_confirm: order is missing");
    return;
  }

  // Order id
  if (!order.id) {
    testResults.failed.push("on_confirm: order.id is missing");
  } else {
    testResults.passed.push(`on_confirm: order.id = ${order.id}`);
  }

  // Order status should be ACTIVE
  if (!order.status) {
    testResults.failed.push("on_confirm: order.status is missing");
  } else if (!VALID_ORDER_STATUSES.includes(order.status)) {
    testResults.failed.push(
      `on_confirm: order.status "${order.status}" is invalid. Expected one of [${VALID_ORDER_STATUSES.join(", ")}]`
    );
  } else {
    testResults.passed.push(`on_confirm: order.status = "${order.status}"`);
  }

  // Provider
  if (!order.provider?.id) {
    testResults.failed.push("on_confirm: order.provider.id is missing");
  } else {
    testResults.passed.push(`on_confirm: order.provider.id = ${order.provider.id}`);
  }

  // Items
  const items: any[] = order.items || [];
  if (items.length === 0) {
    testResults.failed.push("on_confirm: order.items is empty or missing");
  } else {
    testResults.passed.push(`on_confirm: ${items.length} item(s) present`);
    items.forEach((item: any) => {
      if (!item.id) {
        testResults.failed.push("on_confirm: item missing id");
      }
    });
  }

  // Fulfillments
  const fulfillments: any[] = order.fulfillments || [];
  if (fulfillments.length === 0) {
    testResults.failed.push("on_confirm: order.fulfillments is missing or empty");
  } else {
    fulfillments.forEach((f: any) => {
      if (!f.id) {
        testResults.failed.push("on_confirm: fulfillment missing id");
        return;
      }
      if (!f.type) {
        testResults.failed.push(`on_confirm: fulfillment ${f.id} missing type`);
      }
      // State validation if present
      if (f.state?.descriptor?.code) {
        testResults.passed.push(
          `on_confirm: fulfillment ${f.id} state = "${f.state.descriptor.code}"`
        );
      }
    });
    testResults.passed.push(`on_confirm: ${fulfillments.length} fulfillment(s) present`);
  }

  // Payments must be present
  const payments: any[] = order.payments || [];
  if (payments.length === 0) {
    testResults.failed.push("on_confirm: order.payments is missing or empty");
  } else {
    testResults.passed.push(`on_confirm: ${payments.length} payment(s) present`);
    payments.forEach((p: any, i: number) => {
      if (!p.id) {
        testResults.failed.push(`on_confirm: payment[${i}].id is missing`);
      }
      if (!p.status) {
        testResults.failed.push(`on_confirm: payment[${i}].status is missing`);
      }
    });
  }

  // Quote (optional but validate if present)
  if (order.quote) {
    if (!order.quote.price?.value) {
      testResults.failed.push("on_confirm: order.quote.price.value is missing");
    } else {
      testResults.passed.push(`on_confirm: order.quote.price.value = ${order.quote.price.value}`);
    }
  }
}

export default async function on_confirm(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12OnConfirm(element, sessionID, flowId, actionId, usecaseId);

  try {
    const message = element?.jsonRequest?.message;

    if (message && flowId && UNIFIED_CREDIT_FLOWS.includes(flowId)) {
      validateUnifiedCreditOnConfirm(message, result);
    }

    // Cross-validate with confirm
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      const onConfirmItems: any[] = message?.order?.items || [];
      const confirmItems: any[] = confirmData?.items || [];

      const confirmPriceById = new Map<string, string>();
      for (const it of confirmItems) {
        if (it?.id && it?.price?.value !== undefined) {
          confirmPriceById.set(it.id, String(it.price.value));
        }
      }

      const priceMismatches: Array<{ id: string; confirm: string; on_confirm: string }> = [];
      for (const it of onConfirmItems) {
        const id = it?.id;
        if (!id) continue;
        if (!confirmPriceById.has(id)) continue;
        const cnf = parseFloat(confirmPriceById.get(id) as string);
        const onCnf = it?.price?.value !== undefined ? parseFloat(String(it.price.value)) : NaN;
        if (!Number.isNaN(cnf) && !Number.isNaN(onCnf)) {
          if (cnf === onCnf) result.passed.push(`Item '${id}' price matches CONFIRM`);
          else priceMismatches.push({ id, confirm: String(cnf), on_confirm: String(onCnf) });
        }
      }
      if (priceMismatches.length) {
        result.failed.push("Item price mismatches between CONFIRM and on_confirm");
        (result.response as any) = {
          ...(result.response || {}),
          on_confirm_vs_confirm: { priceMismatches },
        };
      }

      // Validate form ID consistency
      await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_confirm", result);
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}