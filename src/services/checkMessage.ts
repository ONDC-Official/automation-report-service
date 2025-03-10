import { Payload, WrappedPayload } from "../types/payload";
import { loadConfig } from "../utils/configLoader"; // Importing function to load configuration for validation modules
import { logger } from "../utils/logger";

// A function to dynamically load and execute a validation function based on the provided module path and function name
const dynamicValidator = (
  modulePathWithFunc: string, // The full path to the module and function (e.g., 'module#function')
  element: any, // The payload or element to be validated
  action: string, // The action to be validated (e.g., 'search', 'init')
  sessionID: string,
  flowId: string
) => {
  // Splitting the modulePathWithFunc string into module path and function name
  const [modulePath, functionName] = modulePathWithFunc.split("#");

  try {
    // Dynamically require the module using the resolved path
    const validatorModule = require(modulePath);

    // Retrieve the validation function from the module
    const validatorFunc = functionName ? validatorModule[functionName] : null;

    // If the function exists and is valid, invoke it with the element and action
    if (typeof validatorFunc === "function") {
      return validatorFunc(element, action, sessionID, flowId);
    } else {
      // Throw an error if the function is not found within the module
      throw new Error(
        `Validator function '${functionName}' not found in '${modulePath}'`
      );
    }
  } catch (error) {
    // Log any error encountered while loading the module or executing the function
    logger.error("Error loading validator:", error);
    throw error; // Rethrow the error to be handled by the calling function
  }
};

// Main function that checks the message validation based on the domain and action
export const checkMessage = async (
  domain: string, // The domain (e.g., 'search', 'select') to determine the appropriate validation module
  element: Payload, // The payload or element to be validated
  action: string, // The specific action to be validated (e.g., 'init', 'confirm')
  sessionId: string,
  flowId: string,
  domainConfig: any
): Promise<object> => {
  // Get the module path and function name based on the version, or fall back to the default configuration
  const modulePathWithFunc = domainConfig?.validationModules;

  // Call the dynamicValidator to load and execute the validation function for the given domain, element, and action
  return dynamicValidator(
    modulePathWithFunc,
    element,
    action,
    sessionId,
    flowId
  );
};
