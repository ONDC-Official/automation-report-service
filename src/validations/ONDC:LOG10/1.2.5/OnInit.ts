import assert from "assert";
import { TestResult, Payload } from "../../../types/payload";
import logger from "@ondc/automation-logger";
import { fetchData } from "../../../utils/redisUtils";
import { DomainValidators } from "../../shared/domainValidator";
import { validateOrderQuote } from "../../shared/quoteValidations";
import { hasTwoOrLessDecimalPlaces } from "../../../utils/constants";

export async function checkOnInit(
  element: Payload,
  sessionID: string,
  flowId: string,
  action_id: string
): Promise<TestResult> {
  // First run common validations
  const commonTestResults = await DomainValidators.ondclogOnInit(
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

  // =========================================================
  // 1. QUOTE CALCULATION VALIDATION
  // =========================================================
  if (message?.order?.quote) {
    validateOrderQuote(message, testResults, {
      validateDecimalPlaces: true,
      validateTaxPresence: true,
      validateTotalMatch: true,
      validateCODBreakup: true,
      flowId: flowId,
    });

    const quote = message.order.quote;

    // Validate quote price has no more than 2 decimal places
    try {
      assert.ok(
        hasTwoOrLessDecimalPlaces(quote.price.value),
        "Quote price value should not have more than 2 decimal places"
      );
      testResults.passed.push("Quote price decimal validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate each breakup item
    const breakup = quote?.breakup || [];
    let totalBreakup = 0;
    let taxPresent = false;
    let deliveryChargePresent = false;

    for (const breakupItem of breakup) {
      const titleType = breakupItem["@ondc/org/title_type"];
      const priceValue = breakupItem?.price?.value;

      try {
        assert.ok(
          priceValue !== undefined,
          `Price value is missing for breakup item: ${titleType || "unknown"}`
        );
        assert.ok(
          hasTwoOrLessDecimalPlaces(priceValue),
          `Price value for breakup '${titleType}' should not have more than 2 decimal places`
        );
        testResults.passed.push(`Decimal validation passed for breakup - '${titleType}'`);
      } catch (error: any) {
        testResults.failed.push(error.message);
      }

      if (priceValue !== undefined) {
        totalBreakup += parseFloat(priceValue);
        totalBreakup = parseFloat(totalBreakup.toFixed(2));
      }

      if (titleType === "tax") taxPresent = true;
      if (titleType === "delivery") deliveryChargePresent = true;
    }

    // Validate tax line item is present
    try {
      assert.ok(
        taxPresent,
        "Fulfillment charges must have a separate quote line item for taxes in on_init"
      );
      testResults.passed.push("Tax line item in quote breakup validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate delivery charge is present
    try {
      assert.ok(
        deliveryChargePresent,
        "Delivery charge must be present in quote breakup in on_init"
      );
      testResults.passed.push("Delivery charge in quote breakup validation passed");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // Validate quote total matches breakup total
    try {
      assert.ok(
        parseFloat(quote.price.value) === totalBreakup,
        `Quote price ${parseFloat(quote.price.value)} does not match the breakup total ${totalBreakup}`
      );
      testResults.passed.push("Quote price matches breakup total");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }

    // WEIGHT_DIFFERENTIAL_FLOW: Validate diff and tax_diff breakup items
    if (flowId === "WEIGHT_DIFFERENTIAL_FLOW") {
      const hasDiffBreakup = breakup.some(
        (b: any) => b["@ondc/org/title_type"] === "diff"
      );
      const hasTaxDiffBreakup = breakup.some(
        (b: any) => b["@ondc/org/title_type"] === "tax_diff"
      );
      try {
        assert.ok(
          hasDiffBreakup && hasTaxDiffBreakup,
          "'diff' and 'tax_diff' titles are missing in quote.breakup for WEIGHT_DIFFERENTIAL_FLOW"
        );
        testResults.passed.push("Differential weight breakup validation passed");
      } catch (error: any) {
        testResults.failed.push(error.message);
      }
    }

    // CASH_ON_DELIVERY_FLOW: Validate COD breakup item
    if (flowId === "CASH_ON_DELIVERY_FLOW") {
      const hasCODBreakup = breakup.some(
        (b: any) => b["@ondc/org/title_type"] === "cod"
      );
      try {
        assert.ok(
          hasCODBreakup,
          "'cod' (along with its tax) charges are missing in quote.breakup for CASH_ON_DELIVERY_FLOW"
        );
        testResults.passed.push("COD charges in quote breakup validation passed");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }
  }

  // =========================================================
  // 2. CROSS-CALL COMPARISON: on_search/init → on_init
  // =========================================================
  try {
    const fulfillments = message?.order?.fulfillments || [];
    const deliveryFulfillment = fulfillments.find(
      (f: any) => f.type === "Delivery" || f.type === "FTL" || f.type === "PTL"
    );

    // Compare provider_id from on_search → on_init
    const savedProviderId = await fetchData(sessionID, transactionId, "on_search_provider_id");
    const onInitProviderId = message?.order?.provider?.id;

    if (savedProviderId && onInitProviderId) {
      try {
        assert.strictEqual(
          onInitProviderId,
          savedProviderId,
          `Provider ID in on_init (${onInitProviderId}) does not match on_search (${savedProviderId})`
        );
        testResults.passed.push("Provider ID matches between on_search and on_init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare fulfillment_id from on_search → on_init
    const savedDeliveryFulfillmentId = await fetchData(
      sessionID,
      transactionId,
      "on_search_delivery_fulfillment_id"
    );
    const onInitFulfillmentId = deliveryFulfillment?.id;

    if (savedDeliveryFulfillmentId && onInitFulfillmentId) {
      try {
        assert.strictEqual(
          onInitFulfillmentId,
          savedDeliveryFulfillmentId,
          `Delivery fulfillment ID in on_init (${onInitFulfillmentId}) does not match on_search (${savedDeliveryFulfillmentId})`
        );
        testResults.passed.push("Delivery fulfillment ID matches between on_search and on_init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare RTO fulfillment_id from on_search → on_init
    const savedRtoFulfillmentId = await fetchData(
      sessionID,
      transactionId,
      "on_search_rto_fulfillment_id"
    );
    const onInitRtoFulfillment = fulfillments.find((f: any) => f.type === "RTO");

    if (savedRtoFulfillmentId && onInitRtoFulfillment?.id) {
      try {
        assert.strictEqual(
          onInitRtoFulfillment.id,
          savedRtoFulfillmentId,
          `RTO fulfillment ID in on_init (${onInitRtoFulfillment.id}) does not match on_search (${savedRtoFulfillmentId})`
        );
        testResults.passed.push("RTO fulfillment ID matches between on_search and on_init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare start GPS from search → on_init
    const savedStartGps = await fetchData(sessionID, transactionId, "search_start_gps");
    const onInitStartGps = deliveryFulfillment?.start?.location?.gps;

    if (savedStartGps && onInitStartGps) {
      try {
        assert.strictEqual(
          onInitStartGps,
          savedStartGps,
          `Start GPS in on_init (${onInitStartGps}) does not match search (${savedStartGps})`
        );
        testResults.passed.push("Start GPS matches between search and on_init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare end GPS from search → on_init
    const savedEndGps = await fetchData(sessionID, transactionId, "search_end_gps");
    const onInitEndGps = deliveryFulfillment?.end?.location?.gps;

    if (savedEndGps && onInitEndGps) {
      try {
        assert.strictEqual(
          onInitEndGps,
          savedEndGps,
          `End GPS in on_init (${onInitEndGps}) does not match search (${savedEndGps})`
        );
        testResults.passed.push("End GPS matches between search and on_init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Compare items from init → on_init (item IDs should be consistent)
    const savedInitItems = (await fetchData(sessionID, transactionId, "init_items")) as any[] | null;
    const onInitItems: any[] = message?.order?.items || [];

    if (savedInitItems && savedInitItems.length > 0 && onInitItems.length > 0) {
      try {
        const initItemIds = savedInitItems.map((i: any) => i.id).sort();
        const onInitItemIds = onInitItems.map((i: any) => i.id).sort();

        assert.deepStrictEqual(
          onInitItemIds,
          initItemIds,
          `Item IDs in on_init [${onInitItemIds}] do not match init [${initItemIds}]`
        );
        testResults.passed.push("Item IDs match between init and on_init");
      } catch (error: any) {
        logger.error(`Error during ${action} validation: ${error.message}`);
        testResults.failed.push(error.message);
      }
    }

    // Validate cancellation_terms are present in on_init (LOG11 specific)
    const cancellationTerms = message?.order?.cancellation_terms || [];
    try {
      assert.ok(
        cancellationTerms.length > 0,
        "message.order.cancellation_terms must be present in on_init"
      );
      testResults.passed.push("Cancellation terms presence validation passed in on_init");
    } catch (error: any) {
      testResults.failed.push(error.message);
    }
  } catch (error: any) {
    logger.error(`Error during ${action} cross-call comparison: ${error.message}`);
    testResults.failed.push(error.message);
  }

  if (testResults.passed.length < 1 && testResults.failed.length < 1)
    testResults.passed.push(`Validated ${action}`);

  return testResults;
}
