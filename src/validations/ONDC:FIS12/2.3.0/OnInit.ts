import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { UNIFIED_CREDIT_FLOWS } from "../../../utils/constants";

const VALID_CHECKLIST_VALUES = ["PENDING", "COMPLETED", "OPTIONAL"];

/**
 * Validate on_init for unified credit flows.
 * Based on doc:
 *   - 1st on_init: fulfillment has CHECKLISTS tag, items may have xinput links
 *   - 2nd on_init: has loan summary (LOAN_INFO/LOAN_OFFER tags on items)
 *   - 3rd on_init: updated checklist (only in offline_journey)
 */
function validateUnifiedCreditOnInit(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("on_init: order is missing");
    return;
  }

  // Provider
  if (!order.provider?.id) {
    testResults.failed.push("on_init: order.provider.id is missing");
  } else {
    testResults.passed.push(`on_init: order.provider.id = ${order.provider.id}`);
  }

  // Items
  const items: any[] = order.items || [];
  if (items.length === 0) {
    testResults.failed.push("on_init: order.items is missing or empty");
  } else {
    testResults.passed.push(`on_init: ${items.length} item(s) present`);
    items.forEach((item: any) => {
      if (!item.id) {
        testResults.failed.push("on_init: item missing id");
      }
    });
  }

  // Fulfillments — validate CHECKLISTS tag when present
  const fulfillments: any[] = order.fulfillments || [];
  if (fulfillments.length === 0) {
    testResults.failed.push("on_init: order.fulfillments is missing or empty");
  } else {
    fulfillments.forEach((f: any) => {
      if (!f.id) {
        testResults.failed.push("on_init: fulfillment missing id");
        return;
      }
      if (!f.type) {
        testResults.failed.push(`on_init: fulfillment ${f.id} missing type`);
      }

      // Validate CHECKLISTS tag if present
      const checklistTag = (f.tags || []).find(
        (t: any) => t.descriptor?.code === "CHECKLISTS"
      );
      if (checklistTag) {
        (checklistTag.list || []).forEach((entry: any) => {
          const code = entry.descriptor?.code;
          const value = entry.value;
          if (!VALID_CHECKLIST_VALUES.includes(value)) {
            testResults.failed.push(
              `on_init fulfillment ${f.id}: CHECKLISTS.${code} has invalid value "${value}". Expected [${VALID_CHECKLIST_VALUES.join(", ")}]`
            );
          } else {
            testResults.passed.push(
              `on_init fulfillment ${f.id}: CHECKLISTS.${code} = "${value}"`
            );
          }
        });
      }
    });
    testResults.passed.push(`on_init: ${fulfillments.length} fulfillment(s) validated`);
  }

  // Payments
  const payments: any[] = order.payments || [];
  if (payments.length === 0) {
    testResults.failed.push("on_init: order.payments is missing or empty");
  } else {
    testResults.passed.push(`on_init: ${payments.length} payment(s) present`);
  }

  // Quote if present (2nd on_init typically has a quote)
  if (order.quote?.price?.value) {
    testResults.passed.push(`on_init: order.quote.price.value = ${order.quote.price.value}`);
  }
}

export default async function on_init(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12OnInit(element, sessionID, flowId, actionId, usecaseId);

  try {
    const message = element?.jsonRequest?.message;

    if (message && flowId && UNIFIED_CREDIT_FLOWS.includes(flowId)) {
      validateUnifiedCreditOnInit(message, result);
    }

    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId) {
      const initData = await getActionData(sessionID, flowId, txnId, "init");
      const onInitItems: any[] = message?.order?.items || [];
      const initItems: any[] = initData?.items || [];

      // Cross-validate provider id
      const onInitProviderId = message?.order?.provider?.id;
      const initProviderId = initData?.order?.provider?.id || initData?.provider?.id;
      if (onInitProviderId && initProviderId) {
        if (onInitProviderId === initProviderId) {
          result.passed.push("on_init: provider.id matches INIT");
        } else {
          result.failed.push("on_init: provider.id mismatch with INIT");
        }
      }

      // Validate form ID consistency if xinput is present
      if (message) {
        await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_init", result);
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}