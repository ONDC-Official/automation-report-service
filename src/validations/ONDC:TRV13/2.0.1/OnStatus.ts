import { TestResult, Payload } from "../../../types/payload";

export default async function on_status(
  element: Payload,
  sessionID: string,
  flowId: string,
  actionId: string
): Promise<TestResult> {
  const result: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = element;
  if (jsonResponse?.response) result.response = jsonResponse.response;

  try {
    const context = jsonRequest?.context;
    const message = jsonRequest?.message;
    const order = message?.order;

    // Validate domain
    if (context?.domain === "ONDC:TRV13") {
      result.passed.push("Domain is ONDC:TRV13");
    } else {
      result.failed.push(`Invalid domain: expected ONDC:TRV13, got ${context?.domain}`);
    }

    // Validate action
    if (context?.action === "on_status") {
      result.passed.push("Action is on_status");
    } else {
      result.failed.push(`Invalid action: expected on_status, got ${context?.action}`);
    }

    // Validate order ID
    if (order?.id) {
      result.passed.push(`Order ID: ${order.id}`);
    } else {
      result.failed.push("Order ID is missing");
    }

    // Validate order state
    if (order?.state) {
      result.passed.push(`Order state: ${order.state}`);
    }

    // Validate provider
    if (order?.provider?.id) {
      result.passed.push(`Provider ID: ${order.provider.id}`);
    }

    // Validate fulfillments with state
    const fulfillments = order?.fulfillments;
    if (fulfillments && Array.isArray(fulfillments) && fulfillments.length > 0) {
      for (const fulfillment of fulfillments) {
        if (fulfillment?.state?.descriptor?.code) {
          result.passed.push(`Fulfillment state: ${fulfillment.state.descriptor.code}`);
        }
      }
    }

    // Validate payments
    const payments = order?.payments;
    if (payments && Array.isArray(payments) && payments.length > 0) {
      for (const payment of payments) {
        if (payment?.status) {
          result.passed.push(`Payment status: ${payment.status}`);
        }
      }
    }

    // Validate updated_at
    if (order?.updated_at) {
      result.passed.push("Order updated_at present");
    }
  } catch (error) {
    result.failed.push(`Validation error: ${error}`);
  }

  return result;
}
