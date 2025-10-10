import { TestResult, Payload } from "../../types/payload";
import {
  createBaseValidationSetup,
  validateHolidays,
  validateLBNPFeatures,
  validateLSPFeatures,
  validatePrepaidPaymentFlow,
  validateCODFlow,
  addDefaultValidationMessage,
  validateTransactionId,
} from "./commonValidations";
import { addTransactionId, updateApiMap } from "../../utils/redisUtils";
import {
  validateTATForFulfillments,
  validateShipmentTypes,
} from "./onSearchValidations";
import { validatorConstant } from "./validatorConstant";

const fis11Validators = validatorConstant.beckn.ondc.fis.fis11.v200;
const log11Validators = validatorConstant.beckn.ondc.log.v125;
const ret16Validators = validatorConstant.beckn.ondc.ret.v125;

/**
 * Wrapper function to validate TAT for on_select, on_init, and on_confirm actions
 */
function validateTAT(message: any, testResults: TestResult): void {
  const catalog = message?.catalog;
  if (catalog?.["bpp/providers"]) {
    const contextTimestamp = new Date();
    catalog["bpp/providers"].forEach((provider: any) => {
      if (provider.fulfillments) {
        validateTATForFulfillments(
          provider.fulfillments,
          contextTimestamp,
          testResults
        );
      }
    });
  }
}

function validateTest(message: any, testResults: TestResult): void {
  testResults.passed.push("Validation is passed for test case");
}

/**
 * Wrapper function to validate shipment types for on_select, on_init, and on_confirm actions
 */
function validateShipmentTypesWrapper(
  message: any,
  testResults: TestResult
): void {
  const catalog = message?.catalog;
  if (catalog?.["bpp/providers"]) {
    catalog["bpp/providers"].forEach((provider: any) => {
      if (provider.fulfillments) {
        validateShipmentTypes(provider.fulfillments, testResults);
      }
    });
  }
}

function validateIntent(message: any, testResults: TestResult): void {
  const intent = message?.intent;
  if (!intent) {
    testResults.failed.push("Intent is missing in search request");
    return;
  }

  if (!intent.category?.descriptor?.code) {
    testResults.failed.push("Intent category descriptor code is missing");
  } else {
    testResults.passed.push("Intent category descriptor code is present");
  }

  if (!intent.payment?.collected_by) {
    testResults.failed.push("Payment collected_by is missing in intent");
  } else {
    testResults.passed.push("Payment collected_by is present in intent");
  }
}

function validatePaymentCollectedBy(
  message: any,
  testResults: TestResult
): void {
  const payment = message?.intent?.payment;
  if (payment?.collected_by && ["BAP", "BPP"].includes(payment.collected_by)) {
    testResults.passed.push("Payment collected_by has valid value");
  } else {
    testResults.failed.push("Payment collected_by should be BAP or BPP");
  }
}

function validateTags(message: any, testResults: TestResult): void {
  const tags =
    message?.intent?.tags || message?.order?.tags || message?.catalog?.tags;
  if (tags && Array.isArray(tags)) {
    const bapTerms = tags.find((tag) => tag.descriptor?.code === "BAP_TERMS");
    const bppTerms = tags.find((tag) => tag.descriptor?.code === "BPP_TERMS");

    if (bapTerms) {
      testResults.passed.push("BAP_TERMS tag is present");
    }
    if (bppTerms) {
      testResults.passed.push("BPP_TERMS tag is present");
    }
  }
}

function validateCatalog(message: any, testResults: TestResult): void {
  const catalog = message?.catalog;
  if (!catalog) {
    testResults.failed.push("Catalog is missing in on_search response");
    return;
  }

  if (!catalog.descriptor?.name) {
    testResults.failed.push("Catalog descriptor name is missing");
  } else {
    testResults.passed.push("Catalog descriptor name is present");
  }

  if (!catalog.providers || !Array.isArray(catalog.providers)) {
    testResults.failed.push("Catalog providers array is missing or invalid");
  } else {
    testResults.passed.push("Catalog providers array is present");
  }
}

function validateProviders(message: any, testResults: TestResult): void {
  const providers = message?.catalog?.providers || message?.order?.provider;
  if (Array.isArray(providers)) {
    providers.forEach((provider, index) => {
      if (!provider.id) {
        testResults.failed.push(`Provider ${index} ID is missing`);
      } else {
        testResults.passed.push(`Provider ${index} ID is present`);
      }

      if (!provider.descriptor?.name) {
        testResults.failed.push(`Provider ${index} descriptor name is missing`);
      } else {
        testResults.passed.push(`Provider ${index} descriptor name is present`);
      }
    });
  } else if (providers) {
    if (!providers.id) {
      testResults.failed.push("Provider ID is missing");
    } else {
      testResults.passed.push("Provider ID is present");
    }
  }
}

function validateProvider(message: any, testResults: TestResult): void {
  const provider = message?.order?.provider;
  if (!provider) {
    testResults.failed.push("Provider is missing in order");
    return;
  }

  if (!provider.id) {
    testResults.failed.push("Provider ID is missing");
  } else {
    testResults.passed.push("Provider ID is present");
  }

  if (!provider.descriptor?.name) {
    testResults.failed.push("Provider descriptor name is missing");
  } else {
    testResults.passed.push("Provider descriptor name is present");
  }
}

function validateItems(message: any, testResults: TestResult): void {
  const items =
    message?.catalog?.providers?.[0]?.items || message?.order?.items;
  if (!items || !Array.isArray(items)) {
    testResults.failed.push("Items array is missing or invalid");
    return;
  }

  items.forEach((item, index) => {
    if (!item.id) {
      testResults.failed.push(`Item ${index} ID is missing`);
    } else {
      testResults.passed.push(`Item ${index} ID is present`);
    }

    if (!item.descriptor?.name) {
      testResults.failed.push(`Item ${index} descriptor name is missing`);
    } else {
      testResults.passed.push(`Item ${index} descriptor name is present`);
    }

    if (!item.price?.value) {
      testResults.failed.push(`Item ${index} price value is missing`);
    } else {
      testResults.passed.push(`Item ${index} price value is present`);
    }
  });
}

function validateFulfillments(message: any, testResults: TestResult): void {
  const fulfillments =
    message?.catalog?.providers?.[0]?.fulfillments ||
    message?.order?.fulfillments;
  if (!fulfillments || !Array.isArray(fulfillments)) {
    testResults.failed.push("Fulfillments array is missing or invalid");
    return;
  }

  fulfillments.forEach((fulfillment, index) => {
    if (!fulfillment.id) {
      testResults.failed.push(`Fulfillment ${index} ID is missing`);
    } else {
      testResults.passed.push(`Fulfillment ${index} ID is present`);
    }

    if (!fulfillment.type) {
      testResults.failed.push(`Fulfillment ${index} type is missing`);
    } else {
      testResults.passed.push(`Fulfillment ${index} type is present`);
    }
  });
}

function validatePayments(message: any, testResults: TestResult): void {
  const payments =
    message?.catalog?.providers?.[0]?.payments || message?.order?.payments;
  if (!payments || !Array.isArray(payments)) {
    testResults.failed.push("Payments array is missing or invalid");
    return;
  }

  payments.forEach((payment, index) => {
    if (!payment.collected_by) {
      testResults.failed.push(`Payment ${index} collected_by is missing`);
    } else {
      testResults.passed.push(`Payment ${index} collected_by is present`);
    }

    if (
      payment.type &&
      !["PRE_ORDER", "ON_ORDER", "POST_FULFILLMENT"].includes(payment.type)
    ) {
      testResults.failed.push(`Payment ${index} type has invalid value`);
    } else if (payment.type) {
      testResults.passed.push(`Payment ${index} type has valid value`);
    }
  });
}

function validateOrder(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is missing");
    return;
  }

  if (!order.provider?.id) {
    testResults.failed.push("Order provider ID is missing");
  } else {
    testResults.passed.push("Order provider ID is present");
  }
}

function validateQuote(message: any, testResults: TestResult): void {
  const quote = message?.order?.quote;
  if (!quote) {
    testResults.failed.push("Quote is missing in order");
    return;
  }

  if (!quote.id) {
    testResults.failed.push("Quote ID is missing");
  } else {
    testResults.passed.push("Quote ID is present");
  }

  if (!quote.price?.value) {
    testResults.failed.push("Quote price value is missing");
  } else {
    testResults.passed.push("Quote price value is present");
  }
}

function validateBilling(message: any, testResults: TestResult): void {
  const billing = message?.order?.billing;
  if (!billing) {
    testResults.failed.push("Billing information is missing");
    return;
  }

  if (!billing.name) {
    testResults.failed.push("Billing name is missing");
  } else {
    testResults.passed.push("Billing name is present");
  }
}

function validateOrderStatus(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (order?.status) {
    const validStatuses = ["ACTIVE", "COMPLETE", "CANCELLED", "INACTIVE"];
    if (validStatuses.includes(order.status)) {
      testResults.passed.push("Order status has valid value");
    } else {
      testResults.failed.push("Order status has invalid value");
    }
  }
}

/**
 * Creates a search validation function with configurable validations
 */
export function createSearchValidator(...config: string[]) {
  return async function checkSearch(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    // Store transaction ID (only in search action - first action in flow)
    const transactionId = context?.transaction_id;
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
        await addTransactionId(sessionID, flowId, transactionId);
        testResults.passed.push(
          `Transaction ID '${transactionId}' stored successfully`
        );
      } catch (error: any) {
        testResults.failed.push(
          `Transaction ID storage failed: ${error.message}`
        );
      }
    } else {
      testResults.failed.push("Transaction ID is missing in context");
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.holidays.validate_holidays:
            validateHolidays(message, context, action, testResults);
            break;
          case log11Validators.lbnp.validate_lbnp:
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case log11Validators.prepaid_payment.validate_prepaid_payment:
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;

          // Financial services validations
          case fis11Validators.intent.validate_intent:
            validateIntent(message, testResults);
            break;
          case fis11Validators.payment.validate_payment_collected_by:
            validatePaymentCollectedBy(message, testResults);
            break;
          case fis11Validators.tags.validate_tags:
            validateTags(message, testResults);
            break;
          case ret16Validators.validate_test:
            validateTest(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an OnSearch validation function with configurable validations
 */
export function createOnSearchValidator(...config: string[]) {
  return async function checkOnSearch(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);
    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);

    // Update API map for tracking
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;

          // Financial services validations
          case fis11Validators.catalog.validate_catalog:
            validateCatalog(message, testResults);
            break;
          case fis11Validators.providers.validate_providers:
            validateProviders(message, testResults);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;

          case ret16Validators.validate_test:
            validateTest(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates a select validation function with configurable validations
 */
export function createSelectValidator(...config: string[]) {
  return async function checkSelect(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.holidays.validate_holidays:
            validateHolidays(message, context, action, testResults);
            break;
          case log11Validators.lbnp.validate_lbnp:
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case log11Validators.prepaid_payment.validate_prepaid_payment:
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an on_select validation function with configurable validations
 */
export function createOnSelectValidator(...config: string[]) {
  return async function checkOnSelect(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates an init validation function with configurable validations
 */
export function createInitValidator(...config: string[]) {
  return async function checkInit(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.holidays.validate_holidays:
            validateHolidays(message, context, action, testResults);
            break;
          case log11Validators.lbnp.validate_lbnp:
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case log11Validators.prepaid_payment.validate_prepaid_payment:
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates a confirm validation function with configurable validations
 */
export function createConfirmValidator(...config: string[]) {
  return async function checkConfirm(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.holidays.validate_holidays:
            validateHolidays(message, context, action, testResults);
            break;
          case log11Validators.lbnp.validate_lbnp:
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case log11Validators.prepaid_payment.validate_prepaid_payment:
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case log11Validators.cod.validate_cod:
            validateCODFlow(flowId, message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an on_init validation function with configurable validations
 */
export function createOnInitValidator(...config: string[]) {
  return async function checkOnInit(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Creates an on_confirm validation function with configurable validations
 */
export function createOnConfirmValidator(...config: string[]) {
  return async function checkOnConfirm(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);
    const transactionId = context?.transaction_id;

    // Validate transaction ID exists for this flow
    await validateTransactionId(sessionID, flowId, transactionId, testResults);
    if (transactionId) {
      try {
        await updateApiMap(sessionID, transactionId, action);
      } catch (error: any) {
        testResults.failed.push(`API map update failed: ${error.message}`);
      }
    }

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          // Logistics validations
          case log11Validators.lsp.validate_lsp:
            validateLSPFeatures(flowId, message, testResults);
            break;
          case log11Validators.tat.validate_tat:
            validateTAT(message, testResults);
            break;
          case log11Validators.shipment_types.validate_shipment_types:
            validateShipmentTypesWrapper(message, testResults);
            break;

          // Financial services validations
          case fis11Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case fis11Validators.quote.validate_quote:
            validateQuote(message, testResults);
            break;
          case fis11Validators.provider.validate_provider:
            validateProvider(message, testResults);
            break;
          case fis11Validators.items.validate_items:
            validateItems(message, testResults);
            break;
          case fis11Validators.fulfillments.validate_fulfillments:
            validateFulfillments(message, testResults);
            break;
          case fis11Validators.payments.validate_payments:
            validatePayments(message, testResults);
            break;
          case fis11Validators.billing.validate_billing:
            validateBilling(message, testResults);
            break;
          case fis11Validators.order_status.validate_order_status:
            validateOrderStatus(message, testResults);
            break;

          default:
            break;
        }
      }
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}
