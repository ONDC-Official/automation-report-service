import { TestResult, Payload } from "../../../types/payload";
import { saveFromElement } from "../../../utils/specLoader";
import { validateTrv11Update } from "../../shared/trv11Validations";
import { validateStops, validateOrderStatus } from "./commonChecks";

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
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const message = jsonRequest?.message;

  // Validate update message for TRV11
  validateTrv11Update(message, testResults);

  // 2.1.0: Validate update_target
  if (message?.update_target) {
    testResults.passed.push(`update: update_target '${message.update_target}' specified`);
  }

  // 2.1.0: Validate order status for update flows
  const order = message?.order;
  if (order?.status) {
    validateOrderStatus(order, testResults, ["SOFT_UPDATE", "CONFIRM_UPDATE"], "update");
  }

  // 2.1.0: Validate updated fulfillment stops (end stop update)
  if (order?.fulfillments && Array.isArray(order.fulfillments)) {
    for (const f of order.fulfillments) {
      if (f.stops) {
        validateStops(f.stops, testResults, `update.fulfillment[${f.id}]`);
      }
    }
  }

  // Validate payment updates (fare difference)
  if (order?.payments && Array.isArray(order.payments)) {
    for (const payment of order.payments) {
      if (payment.params?.amount) {
        testResults.passed.push(`update: payment amount '${payment.params.amount}' present`);
      }
      if (payment.status) {
        testResults.passed.push(`update: payment status '${payment.status}'`);
      }
    }
  }

  // Add default message if no validations ran
  if (testResults.passed.length < 1 && testResults.failed.length < 1) {
    testResults.passed.push(`Validated update`);
  }

  await saveFromElement(element, sessionID, flowId, "jsonRequest");
  return testResults;
}
