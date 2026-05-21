import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { UNIFIED_CREDIT_FLOWS } from "../../../utils/constants";

const VALID_CHECKLIST_VALUES = ["PENDING", "COMPLETED", "OPTIONAL"];

/**
 * Validate on_status payload for unified credit flows.
 * Per doc: lender sends unsolicited on_status with CHECKLISTS tag on fulfillments
 * showing the latest status (COMPLETED/PENDING) of each step.
 */
function validateUnifiedCreditOnStatus(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("on_status: order is missing");
    return;
  }

  // Order must have an id
  if (!order.id) {
    testResults.failed.push("on_status: order.id is missing");
  } else {
    testResults.passed.push(`on_status: order.id = ${order.id}`);
  }

  // Provider must be present
  if (!order.provider?.id) {
    testResults.failed.push("on_status: order.provider.id is missing");
  } else {
    testResults.passed.push(`on_status: order.provider.id = ${order.provider.id}`);
  }

  // Fulfillments with CHECKLISTS tag
  const fulfillments: any[] = order.fulfillments || [];
  if (fulfillments.length === 0) {
    testResults.failed.push("on_status: order.fulfillments is missing or empty");
    return;
  }

  let foundChecklists = false;
  fulfillments.forEach((f: any) => {
    if (!f.id) {
      testResults.failed.push("on_status fulfillment: id missing");
      return;
    }

    const checklistTag = (f.tags || []).find(
      (t: any) => t.descriptor?.code === "CHECKLISTS"
    );

    if (checklistTag) {
      foundChecklists = true;
      const list: any[] = checklistTag.list || [];

      if (list.length === 0) {
        testResults.failed.push(
          `on_status fulfillment ${f.id}: CHECKLISTS tag list is empty`
        );
      } else {
        list.forEach((entry: any) => {
          const code = entry.descriptor?.code;
          const value = entry.value;

          if (!VALID_CHECKLIST_VALUES.includes(value)) {
            testResults.failed.push(
              `on_status fulfillment ${f.id}: CHECKLISTS.${code} has invalid value "${value}". Expected one of [${VALID_CHECKLIST_VALUES.join(", ")}]`
            );
          } else {
            testResults.passed.push(
              `on_status fulfillment ${f.id}: CHECKLISTS.${code} = "${value}"`
            );
          }
        });
      }
    }
  });

  if (!foundChecklists) {
    // CHECKLISTS is the main purpose of on_status in unified credit
    testResults.failed.push(
      "on_status: no fulfillment has a CHECKLISTS tag (required for unified credit on_status)"
    );
  }

  // Items if present — just validate they have ids
  const items: any[] = order.items || [];
  if (items.length > 0) {
    items.forEach((item: any) => {
      if (!item.id) {
        testResults.failed.push("on_status: item missing id");
      }
    });
    testResults.passed.push(`on_status: ${items.length} item(s) present`);
  }
}

export default async function on_status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12OnStatus(element, sessionID, flowId, actionId, usecaseId);

  try {
    const message = element?.jsonRequest?.message;

    if (message && flowId && UNIFIED_CREDIT_FLOWS.includes(flowId)) {
      validateUnifiedCreditOnStatus(message, result);
    }

    // Validate form ID consistency if xinput is present
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId && message) {
      await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_status", result);
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}
