import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { UNIFIED_CREDIT_FLOWS } from "../../../utils/constants";

const VALID_CHECKLIST_CODES = [
  "PERSONAL_INFORMATION_BUSINESS_TERM",
  "PERSONAL_INFORMATION_LAMF",
  "PERSONAL_INFORMATION",
  "SET_LOAN_AMOUNT",
  "KYC_OFFLINE",
  "KYC",
  "LOAN_AGREEMENT",
  "MANDATE",
  "EMANDATE",
];

const VALID_CHECKLIST_VALUES = ["PENDING", "COMPLETED", "OPTIONAL"];

/**
 * Validate CHECKLISTS tag on fulfillments in on_select for unified credit flows.
 * Per doc: fulfillment has a CHECKLISTS tag listing KYC, LOAN_AGREEMENT etc.
 */
function validateOnSelectFulfillments(message: any, testResults: TestResult): void {
  const fulfillments: any[] = message?.order?.fulfillments || [];
  if (fulfillments.length === 0) {
    // on_select may not always have fulfillments; soft fail
    return;
  }

  fulfillments.forEach((f: any) => {
    if (!f.id) {
      testResults.failed.push("on_select fulfillment: id missing");
      return;
    }
    const checklistTag = (f.tags || []).find(
      (t: any) => t.descriptor?.code === "CHECKLISTS"
    );
    if (checklistTag) {
      (checklistTag.list || []).forEach((entry: any) => {
        const code = entry.descriptor?.code;
        const value = entry.value;
        if (VALID_CHECKLIST_VALUES.includes(value)) {
          testResults.passed.push(
            `on_select fulfillment ${f.id}: CHECKLISTS.${code} = "${value}"`
          );
        } else {
          testResults.failed.push(
            `on_select fulfillment ${f.id}: CHECKLISTS.${code} has invalid value "${value}". Expected one of [${VALID_CHECKLIST_VALUES.join(", ")}]`
          );
        }
      });
    }

    // Validate xinput (SET_LOAN_AMOUNT form) if present on items
    const items: any[] = message?.order?.items || [];
    items.forEach((item: any) => {
      if (item.xinput) {
        const headCode = item.xinput?.head?.descriptor?.code;
        if (headCode && headCode !== "SET_LOAN_AMOUNT" &&
          !["KYC", "KYC_OFFLINE", "LOAN_AGREEMENT", "PERSONAL_INFORMATION"].includes(headCode)) {
          testResults.failed.push(
            `Item ${item.id}: xinput head code "${headCode}" is not a recognised unified credit form code`
          );
        } else if (headCode) {
          testResults.passed.push(
            `Item ${item.id}: xinput head code "${headCode}" is valid`
          );
        }
      }
    });
  });
}

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
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;

    if (message) {
      // Validate CHECKLISTS and xinput forms on fulfillments/items
      if (flowId && UNIFIED_CREDIT_FLOWS.includes(flowId)) {
        validateOnSelectFulfillments(message, result);
      }

      // Validate provider present
      if (!message?.order?.provider?.id) {
        result.failed.push("on_select: order.provider.id is missing");
      } else {
        result.passed.push(`on_select: order.provider.id = ${message.order.provider.id}`);
      }

      // Validate items present
      const items: any[] = message?.order?.items || [];
      if (items.length === 0) {
        result.failed.push("on_select: order.items is empty or missing");
      } else {
        result.passed.push(`on_select: ${items.length} item(s) present in order`);
      }
    }

    // Cross-validate with SELECT request
    if (txnId) {
      const selectData = await getActionData(sessionID, flowId, txnId, "select");
      const selItems: any[] = selectData?.order?.items || selectData?.items || [];
      const onSelItems: any[] = message?.order?.items || [];

      const selectItemIds = selItems.map((it: any) => it?.id).filter(Boolean) as string[];
      const onSelectItemIds = onSelItems.map((it: any) => it?.id).filter(Boolean) as string[];

      const missingItems = selectItemIds.filter(id => !onSelectItemIds.includes(id));
      const extraItems = onSelectItemIds.filter(id => !selectItemIds.includes(id));

      if (selectItemIds.length > 0) {
        if (missingItems.length === 0 && extraItems.length === 0) {
          result.passed.push(`All items from select (${selectItemIds.length}) are present in on_select`);
        } else {
          if (missingItems.length > 0) result.failed.push(`Items from select missing in on_select: ${missingItems.join(", ")}`);
          if (extraItems.length > 0) result.failed.push(`Extra items in on_select not present in select: ${extraItems.join(", ")}`);
        }
      }

      // Form ID consistency
      if (message) {
        await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "on_select", result);
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}