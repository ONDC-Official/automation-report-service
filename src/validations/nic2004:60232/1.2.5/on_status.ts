import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import { logger } from "../../../utils/logger";
import { fetchData } from "../../../utils/redisUtils";

export async function checkOnStatus(
  element: Payload,
  sessionID: string,
  flowId: string
): Promise<TestResult> {
  const payload = element;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations`);

  const testResults: TestResult = {
    response: {},
    passed: [],
    failed: [],
  };

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const { context, message } = jsonRequest;
  const transactionId = context?.transaction_id;
  const contextTimestamp = context?.timestamp;
  const fulfillments = message?.order?.fulfillments;
  const shipmentType = message?.items[0].descriptor?.code;
  const orderState = message?.order?.state;
  const paymentStatus = message?.order?.payment?.status;
  const paymentType = message?.order?.payment?.type;
  const paymentTimestamp = message?.order?.payment?.time?.timestamp;

  try {
    assert.ok(
      !(
        orderState === "Complete" &&
        paymentType === "ON-FULFILLMENT" &&
        paymentStatus !== "PAID"
      ),
      "Payment status should be 'PAID' once the order is complete for payment type 'ON-FULFILLMENT'"
    );
    testResults.passed.push("Payment status validation passed");
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  try {
    assert.ok(
      orderState === "Complete" &&
        paymentType === "ON-FULFILLMENT" &&
        paymentStatus == "PAID" &&
        paymentTimestamp,
      "Payment timestamp should be provided once the order is complete and payment has been made"
    );
    testResults.passed.push("Payment timestamp validation passed");
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  try {
    fulfillments.forEach((fulfillment: any) => {
      const ffState = fulfillment?.state?.descriptor?.code;
      const pickupTimestamp = fulfillment?.start?.time?.timestamp;
      const deliveryTimestamp = fulfillment?.end?.time?.timestamp;
      const trackingTag = fulfillment.tags?.find(
        (tag: { code: string }) => tag.code === "tracking"
      );

      // AWB number validation for P2H2P shipments
      try {
        assert.ok(
          shipmentType == "P2H2P" && fulfillment["@ondc/org/awb_no"],
          "AWB no is required for P2H2P shipments"
        );
        testResults.passed.push("AWB number validation passed");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }

      // Pickup/Delivery timestamp validation for pending orders
      try {
        assert.ok(
          ["Pending", "Agent-assigned", "Searching-for-agent"].includes(
            ffState
          ) &&
            (pickupTimestamp || deliveryTimestamp),
          "Pickup/Delivery timestamp cannot be provided as the order has not been picked up"
        );
        testResults.passed.push("Pickup/Delivery timestamp validation passed");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }

      // Order state validation
      try {
        assert.ok(
          ["Pending", "Agent-assigned"].includes(ffState) &&
            orderState !== "In-progress",
          "Order state should be 'In-progress'"
        );
        testResults.passed.push("Order state validation passed");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }

      // Tracking tag validation
      try {
        assert.ok(
          ffState == "Order-picked-up" &&
            fulfillment.tracking === true &&
            trackingTag,
          "Tracking tag to be provided once order is picked up and tracking is enabled for the fulfillment"
        );
        testResults.passed.push("Tracking tag validation passed");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    });
  } catch (error: any) {
    logger.error(
      `Unexpected error during ${action} validation: ${error.message}`
    );
    testResults.failed.push(`Unexpected error: ${error.message}`);
  }
  if (testResults.passed.length < 1)
    testResults.passed.push(`Validated ${action}`);
  return testResults;
}
