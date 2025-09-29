import { TestResult, Payload } from "../../types/payload";
import {
  createBaseValidationSetup,
  validateHolidays,
  validateLBNPFeatures,
  validateLSPFeatures,
  validatePrepaidPaymentFlow,
  validateCODFlow,
  addDefaultValidationMessage,
} from "./commonValidations";
import {
  validateTATForFulfillments,
  validateShipmentTypes,
} from "./onSearchValidations";

/**
 * Wrapper function to validate TAT for on_select, on_init, and on_confirm actions
 */
function validateTAT(message: any, testResults: TestResult): void {
  const catalog = message?.catalog;
  if (catalog?.["bpp/providers"]) {
    const contextTimestamp = new Date();
    catalog["bpp/providers"].forEach((provider: any) => {
      if (provider.fulfillments) {
        validateTATForFulfillments(provider.fulfillments, contextTimestamp, testResults);
      }
    });
  }
}

/**
 * Wrapper function to validate shipment types for on_select, on_init, and on_confirm actions
 */
function validateShipmentTypesWrapper(message: any, testResults: TestResult): void {
  const catalog = message?.catalog;
  if (catalog?.["bpp/providers"]) {
    catalog["bpp/providers"].forEach((provider: any) => {
      if (provider.fulfillments) {
        validateShipmentTypes(provider.fulfillments, testResults);
      }
    });
  }
}

/**
 * Helper function to apply configured validations using switch case
 */
function applyValidations(
  config: any,
  element: Payload,
  sessionID: string,
  flowId: string,
  testResults: TestResult,
  action: string,
  context: any,
  message: any
): void {
  // Apply configured validations using switch case
  const validationFlags = [
    { flag: config.validateHolidays, type: 'holidays' },
    { flag: config.validateLBNP, type: 'lbnp' },
    { flag: config.validatePrepaidPayment, type: 'prepaid' },
    { flag: config.validateCOD, type: 'cod' }
  ];

  for (const validation of validationFlags) {
    if (validation.flag) {
      switch (validation.type) {
        case 'holidays':
          validateHolidays(message, context, action, testResults);
          break;
        case 'lbnp':
          validateLBNPFeatures(flowId, message, testResults);
          break;
        case 'prepaid':
          validatePrepaidPaymentFlow(flowId, message, testResults);
          break;
        case 'cod':
          validateCODFlow(flowId, message, testResults);
          break;
        default:
          break;
      }
    }
  }

  // Apply custom validation if provided
  if (config.customValidation) {
    config.customValidation(element, sessionID, flowId, testResults);
  }
}

/**
 * Helper function to apply seller response validations using switch case
 */
function applySellerValidations(
  config: DomainValidationConfig,
  element: Payload,
  sessionID: string,
  flowId: string,
  testResults: TestResult,
  message: any
): void {
  // Apply configured validations using switch case
  const validationFlags = [
    { flag: config.validateLSP, type: 'lsp' },
    { flag: config.validateTAT, type: 'tat' },
    { flag: config.validateShipmentTypes, type: 'shipment' }
  ];

  for (const validation of validationFlags) {
    if (validation.flag) {
      switch (validation.type) {
        case 'lsp':
          validateLSPFeatures(flowId, message, testResults);
          break;
        case 'tat':
          validateTAT(message, testResults);
          break;
        case 'shipment':
          validateShipmentTypesWrapper(message, testResults);
          break;
        default:
          break;
      }
    }
  }

  // Apply custom validation if provided
  if (config.customValidation) {
    config.customValidation(element, sessionID, flowId, testResults);
  }
}

/**
 * Configuration for domain-specific validations
 */
export interface DomainValidationConfig {
  /** Whether to validate holidays */
  validateHolidays?: boolean;
  /** Whether to validate LBNP features */
  validateLBNP?: boolean;
  /** Whether to validate LSP features */
  validateLSP?: boolean;
  /** Whether to validate prepaid payment flow */
  validatePrepaidPayment?: boolean;
  /** Whether to validate COD flow */
  validateCOD?: boolean;
  /** Whether to validate TAT */
  validateTAT?: boolean;
  /** Whether to validate shipment types */
  validateShipmentTypes?: boolean;
  /** Custom validation function */
  customValidation?: (payload: Payload, sessionID: string, flowId: string, testResults: TestResult) => void;
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
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case 'validateHolidays':
            validateHolidays(message, context, action, testResults);
            break;
          case 'validateLBNP':
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case 'validatePrepaidPayment':
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
           case 'validateCOD':
             validateCODFlow(flowId, message, testResults);
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
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case 'validateLSP':
            validateLSPFeatures(flowId, message, testResults);
            break;
          case 'validateTAT':
            validateTAT(message, testResults);
            break;
          case 'validateShipmentTypes':
            validateShipmentTypesWrapper(message, testResults);
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
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case 'validateHolidays':
            validateHolidays(message, context, action, testResults);
            break;
          case 'validateLBNP':
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case 'validatePrepaidPayment':
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case 'validateCOD':
            validateCODFlow(flowId, message, testResults);
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
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case 'validateLSP':
            validateLSPFeatures(flowId, message, testResults);
            break;
          case 'validateTAT':
            validateTAT(message, testResults);
            break;
          case 'validateShipmentTypes':
            validateShipmentTypesWrapper(message, testResults);
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
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case 'validateHolidays':
            validateHolidays(message, context, action, testResults);
            break;
          case 'validateLBNP':
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case 'validatePrepaidPayment':
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case 'validateCOD':
            validateCODFlow(flowId, message, testResults);
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
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case 'validateLSP':
            validateLSPFeatures(flowId, message, testResults);
            break;
          case 'validateTAT':
            validateTAT(message, testResults);
            break;
          case 'validateShipmentTypes':
            validateShipmentTypesWrapper(message, testResults);
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
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case 'validateHolidays':
            validateHolidays(message, context, action, testResults);
            break;
          case 'validateLBNP':
            validateLBNPFeatures(flowId, message, testResults);
            break;
          case 'validatePrepaidPayment':
            validatePrepaidPaymentFlow(flowId, message, testResults);
            break;
          case 'validateCOD':
            validateCODFlow(flowId, message, testResults);
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
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    for (const validation of config) {
      if (validation) {
        switch (validation) {
          case 'validateLSP':
            validateLSPFeatures(flowId, message, testResults);
            break;
          case 'validateTAT':
            validateTAT(message, testResults);
            break;
          case 'validateShipmentTypes':
            validateShipmentTypesWrapper(message, testResults);
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
 * Creates a generic validation function with configurable validations
 */
export function createGenericValidator(
  actionName: string,
  config: DomainValidationConfig = {}
) {
  return async function checkGeneric(
    element: Payload,
    sessionID: string,
    flowId: string
  ): Promise<TestResult> {
    const { testResults, action, context, message } = createBaseValidationSetup(element);

    // Apply configured validations
    if (config.validateHolidays) {
      validateHolidays(message, context, action, testResults);
    }

    if (config.validateLBNP) {
      validateLBNPFeatures(flowId, message, testResults);
    }

    if (config.validateLSP) {
      validateLSPFeatures(flowId, message, testResults);
    }

    if (config.validatePrepaidPayment) {
      validatePrepaidPaymentFlow(flowId, message, testResults);
    }

    if (config.validateCOD) {
      validateCODFlow(flowId, message, testResults);
    }

    // Apply custom validation if provided
    if (config.customValidation) {
      config.customValidation(element, sessionID, flowId, testResults);
    }

    // Add default message if no validations ran
    addDefaultValidationMessage(testResults, action);

    return testResults;
  };
}

/**
 * Pre-configured validators for common domain patterns
 */
export const DomainValidators = {

  ondclogSearch: createSearchValidator(
    "validateHolidays",
    "validateLBNP",
    "validatePrepaidPayment",
    "validateCOD"
  ),


   ondclogOnSearch: createOnSearchValidator(
    "validateLSP",
    "validateTAT", 
    "validateShipmentTypes"
  ),

 
  nic2004Search: createSearchValidator("validateHolidays"),

  
  ondclogSelect: createSelectValidator(
    "validateHolidays",
    "validateLBNP",
    "validatePrepaidPayment",
    "validateCOD"
  ),

  /**
   * ONDC LOG10/LOG11 on_select validator with comprehensive validations
   */
  ondclogOnSelect: createOnSelectValidator(
    "validateLSP",
    "validateTAT",
    "validateShipmentTypes"
  ),

  /**
   * ONDC LOG10/LOG11 init validator with all validations
   */
  ondclogInit: createInitValidator(
    "validateHolidays",
    "validateLBNP",
    "validatePrepaidPayment",
    "validateCOD"
  ),

  /**
   * ONDC LOG10/LOG11 on_init validator with comprehensive validations
   */
  ondclogOnInit: createOnInitValidator(
    "validateLSP",
    "validateTAT",
    "validateShipmentTypes"
  ),

  // /**
  //  * ONDC LOG10/LOG11 confirm validator with all validations
  //  */
  // ondclogConfirm: createConfirmValidator({
  //   validateHolidays: true,
  //   validateLBNP: true,
  //   validatePrepaidPayment: true,
  //   validateCOD: true,
  // }),

  // /**
  //  * ONDC LOG10/LOG11 on_confirm validator with comprehensive validations
  //  */
  // ondclogOnConfirm: createOnConfirmValidator({
  //   validateLSP: true,
  //   validateTAT: true,
  //   validateShipmentTypes: true,
  // }),

  // /**
  //  * Generic OnSearch validator with basic validations
  //  */
  // genericOnSearch: createOnSearchValidator({
  //   validateLSP: true,
  // }),

  // /**
  //  * Generic validator for actions that don't need specific validations
  //  */
  // generic: createGenericValidator("generic"),
};
