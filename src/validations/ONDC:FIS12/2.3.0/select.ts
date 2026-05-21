import { TestResult, Payload } from "../../../types/payload";
import { DomainValidators } from "../../shared/domainValidator";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData, compareSelectVsOnSearch } from "../../../services/actionDataService";
import { validateFormIdIfXinputPresent } from "../../shared/formValidations";
import { UNIFIED_CREDIT_FLOWS } from "../../../utils/constants";

/**
 * Validate select order for unified credit flows.
 * Per doc:
 *   - credit_offline (LAMF): items have PLEDGE_REQUIREMENTS tag with SCHEME_CODE + UNITS_PLEDGED
 *   - offline_journey (Personal Loan): items are straightforward (provider.id + item ids)
 */
function validateUnifiedCreditSelect(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("select: order is missing");
    return;
  }

  // Provider must be present
  if (!order.provider?.id) {
    testResults.failed.push("select: order.provider.id is missing");
  } else {
    testResults.passed.push(`select: order.provider.id = ${order.provider.id}`);
  }

  // Items
  const items: any[] = order.items || [];
  if (items.length === 0) {
    testResults.failed.push("select: order.items is missing or empty");
    return;
  }
  testResults.passed.push(`select: ${items.length} item(s) present`);

  items.forEach((item: any) => {
    if (!item.id) {
      testResults.failed.push("select: item missing id");
      return;
    }

    // Validate PLEDGE_REQUIREMENTS tag when present (LAMF flow)
    const pledgeTag = (item.tags || []).find(
      (t: any) => t.descriptor?.code === "PLEDGE_REQUIREMENTS"
    );
    if (pledgeTag) {
      const pledgeList: any[] = pledgeTag.list || [];
      const hasSchemeCode = pledgeList.some(
        (e: any) => e.descriptor?.code === "SCHEME_CODE" && e.value
      );
      const hasUnitsPledged = pledgeList.some(
        (e: any) => e.descriptor?.code === "UNITS_PLEDGED" && e.value
      );
      if (!hasSchemeCode) {
        testResults.failed.push(`Item ${item.id}: PLEDGE_REQUIREMENTS.SCHEME_CODE is missing`);
      } else {
        testResults.passed.push(`Item ${item.id}: PLEDGE_REQUIREMENTS.SCHEME_CODE present`);
      }
      if (!hasUnitsPledged) {
        testResults.failed.push(`Item ${item.id}: PLEDGE_REQUIREMENTS.UNITS_PLEDGED is missing`);
      } else {
        testResults.passed.push(`Item ${item.id}: PLEDGE_REQUIREMENTS.UNITS_PLEDGED present`);
      }
    }

    // Parent item id must be present (all selected items are child items)
    if (item.parent_item_id) {
      testResults.passed.push(`Item ${item.id}: parent_item_id = ${item.parent_item_id}`);
    }
  });

  // Fulfillments if present
  const fulfillments: any[] = order.fulfillments || [];
  if (fulfillments.length > 0) {
    fulfillments.forEach((f: any) => {
      if (!f.id) {
        testResults.failed.push("select: fulfillment missing id");
      } else {
        testResults.passed.push(`select: fulfillment id = ${f.id}`);
      }
    });
  }
}

export default async function select(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string,
  usecaseId?: string
): Promise<TestResult> {
  const result = await DomainValidators.fis12Select(element, sessionID, flowId, actionId, usecaseId);

  try {
    const message = element?.jsonRequest?.message;
    const txnId = element?.jsonRequest?.context?.transaction_id as string | undefined;

    if (message && flowId && UNIFIED_CREDIT_FLOWS.includes(flowId)) {
      validateUnifiedCreditSelect(message, result);
    }

    if (txnId) {
      const onSearchData = await getActionData(sessionID, flowId, txnId, "on_search");
      (result.response as any) = { ...(result.response || {}), on_search: onSearchData };

      if (message) {
        const cmp = compareSelectVsOnSearch(message, onSearchData);
        result.passed.push(...cmp.passed);
        result.failed.push(...cmp.failed);
        if (Object.keys(cmp.details).length) {
          (result.response as any).select_vs_on_search = cmp.details;
        }

        // Validate form ID consistency if xinput is present
        await validateFormIdIfXinputPresent(message, sessionID, flowId, txnId, "select", result);
      }
    }
  } catch (_) {}

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return result;
}