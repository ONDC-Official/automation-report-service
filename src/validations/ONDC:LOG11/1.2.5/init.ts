import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { fetchData, saveData } from "../../../utils/redisUtils";
import { DomainValidators } from "../../shared/domainValidator";

export async function checkInit(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  // Run common domain validations first
  const commonTestResults = await DomainValidators.ondclogInit(
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
  const contextTimestamp = context?.timestamp;
  const transactionId = context?.transaction_id;

  // --- Billing Timestamp Validations ---
  const billingCreatedAt = message?.order?.billing?.created_at;
  const billingUpdatedAt = message?.order?.billing?.updated_at;

  saveData(sessionID, transactionId, "billingTimestamp", billingCreatedAt);

  try {
    assert.ok(
      billingCreatedAt <= contextTimestamp,
      "Billing timestamp cannot be future dated w.r.t context/timestamp"
    );
    testResults.passed.push("Billing created_at timestamp validation passed");
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  try {
    assert.ok(
      billingCreatedAt === billingUpdatedAt,
      "Billing created_at timestamp should be equal to updated_at"
    );
    testResults.passed.push("Billing updated_at timestamp validation passed");
  } catch (error: any) {
    logger.error(`Error during ${action} validation: ${error.message}`);
    testResults.failed.push(error.message);
  }

  // --- Cross-call Comparison: search → init ---
  try {
    const fulfillments = message?.order?.fulfillments || [];
    const deliveryFulfillment = fulfillments.find(
      (f: any) => f.type === "Delivery" || f.type === "FTL" || f.type === "PTL"
    );

    // Compare provider_id from on_search with init
    const savedProviderId = await fetchData(sessionID, transactionId, "on_search_provider_id");
    const initProviderId = message?.order?.provider?.id;

    if (savedProviderId && initProviderId) {
      try {
        assert.strictEqual(
          initProviderId,
          savedProviderId,
          `Provider ID in init (${initProviderId}) does not match on_search provider ID (${savedProviderId})`
        );
        testResults.passed.push("Provider ID matches between on_search and init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare start GPS (search → init)
    const savedStartGps = await fetchData(sessionID, transactionId, "search_start_gps");
    const initStartGps = deliveryFulfillment?.start?.location?.gps;

    if (savedStartGps && initStartGps) {
      try {
        assert.strictEqual(
          initStartGps,
          savedStartGps,
          `Start GPS in init (${initStartGps}) does not match search start GPS (${savedStartGps})`
        );
        testResults.passed.push("Start GPS matches between search and init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare end GPS (search → init)
    const savedEndGps = await fetchData(sessionID, transactionId, "search_end_gps");
    const initEndGps = deliveryFulfillment?.end?.location?.gps;

    if (savedEndGps && initEndGps) {
      try {
        assert.strictEqual(
          initEndGps,
          savedEndGps,
          `End GPS in init (${initEndGps}) does not match search end GPS (${savedEndGps})`
        );
        testResults.passed.push("End GPS matches between search and init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare start area code (search → init)
    const savedStartAreaCode = await fetchData(sessionID, transactionId, "search_start_area_code");
    const initStartAreaCode = deliveryFulfillment?.start?.location?.address?.area_code;

    if (savedStartAreaCode && initStartAreaCode) {
      try {
        assert.strictEqual(
          initStartAreaCode,
          savedStartAreaCode,
          `Start area code in init (${initStartAreaCode}) does not match search (${savedStartAreaCode})`
        );
        testResults.passed.push("Start area code matches between search and init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare end area code (search → init)
    const savedEndAreaCode = await fetchData(sessionID, transactionId, "search_end_area_code");
    const initEndAreaCode = deliveryFulfillment?.end?.location?.address?.area_code;

    if (savedEndAreaCode && initEndAreaCode) {
      try {
        assert.strictEqual(
          initEndAreaCode,
          savedEndAreaCode,
          `End area code in init (${initEndAreaCode}) does not match search (${savedEndAreaCode})`
        );
        testResults.passed.push("End area code matches between search and init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare fulfillment_id from on_search → init
    const savedDeliveryFulfillmentId = await fetchData(
      sessionID,
      transactionId,
      "on_search_delivery_fulfillment_id"
    );
    const initFulfillmentId = deliveryFulfillment?.id;

    if (savedDeliveryFulfillmentId && initFulfillmentId) {
      try {
        assert.strictEqual(
          initFulfillmentId,
          savedDeliveryFulfillmentId,
          `Delivery fulfillment ID in init (${initFulfillmentId}) does not match on_search (${savedDeliveryFulfillmentId})`
        );
        testResults.passed.push("Delivery fulfillment ID matches between on_search and init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare pickup location id from on_search → init
    const savedStartLocationId = await fetchData(sessionID, transactionId, "search_start_location_id");
    const initStartLocationId = deliveryFulfillment?.start?.location?.id;

    if (savedStartLocationId && initStartLocationId) {
      try {
        assert.strictEqual(
          initStartLocationId,
          savedStartLocationId,
          `Start location ID in init (${initStartLocationId}) does not match search (${savedStartLocationId})`
        );
        testResults.passed.push("Start location ID matches between search and init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare provider location id from on_search → init
    const savedProviderLocationId = await fetchData(sessionID, transactionId, "on_search_provider_location_id");
    const initProviderLocationId = message?.order?.provider?.locations?.[0]?.id;

    if (savedProviderLocationId && initProviderLocationId) {
      try {
        assert.strictEqual(
          initProviderLocationId,
          savedProviderLocationId,
          `Provider location ID in init (${initProviderLocationId}) does not match on_search (${savedProviderLocationId})`
        );
        testResults.passed.push("Provider location ID matches between on_search and init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare item IDs from on_search → init
    const savedOnSearchItems = await fetchData(sessionID, transactionId, "on_search_items");
    const initItemsForCompare = message?.order?.items || [];

    if (
      savedOnSearchItems &&
      (savedOnSearchItems as any[]).length > 0 &&
      initItemsForCompare.length > 0
    ) {
      const onSearchIds = new Set((savedOnSearchItems as any[]).map((i: any) => i.id));
      const unknownIds = initItemsForCompare
        .map((i: any) => i.id)
        .filter((id: string) => id && !onSearchIds.has(id));
      try {
        assert.ok(
          unknownIds.length === 0,
          `Item ID(s) in init (${unknownIds.join(", ")}) not present in on_search catalog`
        );
        testResults.passed.push("Item IDs in init match on_search catalog");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Verify buyer's acceptance of the LSP's static terms (bap_terms.accept_bpp_terms)
    const orderTags: any[] = message?.order?.tags || [];
    const bapTermsGroup = orderTags.find((t: any) => t.code === "bap_terms");
    const acceptBppTerms = bapTermsGroup?.list?.find(
      (entry: any) => entry.code === "accept_bpp_terms"
    )?.value;

    if (acceptBppTerms !== undefined) {
      try {
        assert.ok(
          typeof acceptBppTerms === "string" &&
            ["y", "yes"].includes(acceptBppTerms.toLowerCase()),
          `order.tags bap_terms.accept_bpp_terms should indicate acceptance ('Y'/'yes'), got '${acceptBppTerms}'`
        );
        testResults.passed.push("bap_terms.accept_bpp_terms indicates acceptance of LSP's static terms");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Save item IDs from init for comparison in on_init
    const items = message?.order?.items || [];
    if (items.length > 0) {
      saveData(sessionID, transactionId, "init_items", items);
    }

    // Save payment from init for comparison
    const payment = message?.order?.payment;
    if (payment) {
      saveData(sessionID, transactionId, "init_payment_type", payment?.type);
    }
  } catch (error: any) {
    logger.error(`Error during ${action} cross-call comparison: ${error.message}`);
    testResults.failed.push(error.message);
  }

  // --- CASH_ON_DELIVERY_FLOW: validate COD items ---
  if (flowId === "CASH_ON_DELIVERY_FLOW") {
    try {
      const items = message?.order?.items || [];
      let baseItemFound = false;
      let codItemFound = false;

      for (const item of items) {
        const typeTag = item?.tags?.find(
          (tag: { code: string }) => tag.code === "type"
        );
        const typeValue = typeTag?.list?.find(
          (entry: { code: string; value: string }) =>
            entry.code === "type" && typeof entry.value === "string"
        )?.value.toLowerCase();

        if (typeValue === "base") baseItemFound = true;
        if (typeValue === "cod") codItemFound = true;

        if (baseItemFound && codItemFound) break;
      }

      assert.ok(
        baseItemFound,
        `At least one item in message.order.items should have a type tag with value "base"`
      );
      assert.ok(
        codItemFound,
        `At least one item in message.order.items should have a type tag with value "cod"`
      );
      testResults.passed.push(`Both base and cod type items are present`);
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}
