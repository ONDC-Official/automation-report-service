import { TestResult, Payload } from "../../types/payload";
import {
  createBaseValidationSetup,
  addDefaultValidationMessage,
  validateTransactionId,
} from "./commonValidations";
import { updateApiMap } from "../../utils/redisUtils";
import { validatorConstant } from "./validatorConstant";

const ret16Validators = validatorConstant.beckn.ondc.ret.v125;
const ret15Validators = validatorConstant.beckn.ondc.ret15.v125;

// Import actual validation functions
function validateOrder(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (!order) {
    testResults.failed.push("Order is required but not found");
    return;
  }
  testResults.passed.push("Order validation passed");
}

function validateProvider(message: any, testResults: TestResult): void {
  const provider = message?.provider || message?.order?.provider;
  if (!provider) {
    testResults.failed.push("Provider is required but not found");
    return;
  }
  testResults.passed.push("Provider validation passed");
}

function validateOrderStatus(message: any, testResults: TestResult): void {
  const order = message?.order;
  if (!order || !order.status) {
    testResults.failed.push("Order status is required but not found");
    return;
  }
  testResults.passed.push("Order status validation passed");
}

/**
 * Creates a status validation function with configurable validations
 */
export function createStatusValidator(...config: string[]) {
  return async function checkStatus(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

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
          case ret16Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret16Validators.provider.validate_provider:
            validateProvider(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.provider.validate_provider:
            validateProvider(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an on_status validation function with configurable validations
 */
export function createOnStatusValidator(...config: string[]) {
  return async function checkOnStatus(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

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
          case ret16Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret16Validators.order_status.validate_order_status:
            validateOrderStatus(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order_status.validate_order_status:
            validateOrderStatus(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates a cancel validation function with configurable validations
 */
export function createCancelValidator(...config: string[]) {
  return async function checkCancel(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

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
          case ret16Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an on_cancel validation function with configurable validations
 */
export function createOnCancelValidator(...config: string[]) {
  return async function checkOnCancel(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

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
          case ret16Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an update validation function with configurable validations
 */
export function createUpdateValidator(...config: string[]) {
  return async function checkUpdate(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

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
          case ret16Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an on_update validation function with configurable validations
 */
export function createOnUpdateValidator(...config: string[]) {
  return async function checkOnUpdate(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

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
          case ret16Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates a track validation function with configurable validations
 */
export function createTrackValidator(...config: string[]) {
  return async function checkTrack(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

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
          case ret16Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}

/**
 * Creates an on_track validation function with configurable validations
 */
export function createOnTrackValidator(...config: string[]) {
  return async function checkOnTrack(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } =
      createBaseValidationSetup(element);

    const transactionId = context?.transaction_id;

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
          case ret16Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          case ret15Validators.order.validate_order:
            validateOrder(message, testResults);
            break;
          default:
            break;
        }
      }
    }

    addDefaultValidationMessage(testResults, action);
    return testResults;
  };
}