import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { getActionData } from "../../../services/actionDataService";
import { validateReturnRequest, validateRefundSettlement } from "./returnChecks";
import { validatePaymentParamsEcho } from "./orderFormationChecks";

export default async function update(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) testResults.response = jsonResponse.response;

  const message = jsonRequest?.message;

  // Note: deliberately NOT using the shared createUpdateValidator() factory here — it
  // unconditionally validates update_target against a TRV10-specific whitelist
  // (e.g. "order.quote.breakup", "fulfillments[0].stops") that doesn't match ONDC
  // retail's update_target values, which would produce guaranteed false-positive failures.
  if (message?.update_target) {
    testResults.passed.push(`update: update_target '${message.update_target}' is present`);
  } else {
    testResults.failed.push("update: update_target is missing");
  }

  // Return / refund legs — see returnChecks.ts for the calibration. `item` is the buyer
  // raising a return (update_return); `payment` is the buyer app reporting the refund
  // (update_settlement_trail, in both the return and the merchant part-cancel flows).
  try {
    const order = message?.order;
    const txnId = jsonRequest?.context?.transaction_id as string | undefined;
    if (txnId && message?.update_target === "item") {
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      validateReturnRequest(order, confirmData?.items, `update (${actionId})`, testResults);
    } else if (txnId && message?.update_target === "payment") {
      // Read BEFORE this leg is saved; on_update is keyed on context.action, so this is the
      // latest on_update — the one that booked the quote_trail being refunded.
      const previousOnUpdate = await getActionData(sessionID, flowId, txnId, "on_update");
      validateRefundSettlement(order, previousOnUpdate, `update (${actionId})`, testResults);
      // The buyer app's refund report must not restate the order's payment differently from
      // confirm (the RTO reference sends the contract's literal 1150 / 3937 here). Skips when the
      // update carries no params, as the return flow's settlement trail does.
      const confirmData = await getActionData(sessionID, flowId, txnId, "confirm");
      validatePaymentParamsEcho(order, confirmData?.payments, `update (${actionId})`, testResults);
    }
  } catch (_) {}

  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push("Validated update");
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
