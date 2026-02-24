import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { saveData } from "../../../utils/redisUtils";
import { DomainValidators } from "../../shared/domainValidator";

export async function checkOnSearch(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  // Run common domain validations first
  const commonTestResults = await DomainValidators.ondclogOnSearch(
    element,
    sessionID,
    flowId,
    action_id
  );

  const testResults: TestResult = {
    response: commonTestResults.response,
    passed: [...commonTestResults.passed],
    failed: [...commonTestResults.failed],
  };

  const payload = element;
  const action = payload?.action.toLowerCase();
  logger.info(`Inside ${action} validations for LOG11`);

  const { jsonRequest, jsonResponse } = payload;
  if (jsonResponse?.response) testResults.response = jsonResponse?.response;

  const { context, message } = jsonRequest;
  const transactionId = context?.transaction_id;

  try {
    const providers = message?.catalog?.["bpp/providers"] || [];
    const provider = providers[0];

    // Save provider_id for comparison in init
    const providerId = provider?.id;
    if (providerId) saveData(sessionID, transactionId, "on_search_provider_id", providerId);

    // Save items and fulfillments for comparison
    const items = provider?.items || [];
    const fulfillments = provider?.fulfillments || [];
    const deliveryFulfillment = fulfillments.find(
      (f: any) => f.type === "Delivery" || f.type === "FTL" || f.type === "PTL"
    );
    const rtoFulfillment = fulfillments.find((f: any) => f.type === "RTO");

    if (deliveryFulfillment?.id)
      saveData(sessionID, transactionId, "on_search_delivery_fulfillment_id", deliveryFulfillment.id);
    if (rtoFulfillment?.id)
      saveData(sessionID, transactionId, "on_search_rto_fulfillment_id", rtoFulfillment.id);
    if (items.length > 0)
      saveData(sessionID, transactionId, "on_search_items", items);

    // Validate provider exists
    try {
      assert.ok(provider, "message.catalog['bpp/providers'] must have at least one provider");
      testResults.passed.push("Provider existence validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate provider id
    try {
      assert.ok(providerId, "Provider id must be present in message.catalog['bpp/providers'][0].id");
      testResults.passed.push("Provider ID validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate at least one Delivery fulfillment exists
    try {
      assert.ok(
        deliveryFulfillment,
        "At least one fulfillment of type Delivery/FTL/PTL must be present in on_search"
      );
      testResults.passed.push("Delivery fulfillment type validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate at least one item exists
    try {
      assert.ok(items.length > 0, "At least one item must be present in on_search catalog providers");
      testResults.passed.push("Items existence validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // For P2H2P: Validate RTO fulfillment is provided
    try {
      assert.ok(
        rtoFulfillment,
        "An RTO fulfillment must be present in on_search for P2H2P logistics"
      );
      testResults.passed.push("RTO fulfillment validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}