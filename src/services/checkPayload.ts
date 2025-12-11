import { Payload } from "../types/payload";
import logger from "@ondc/automation-logger";
import { runValidations } from "../validations/shared/schemaValidator";
import { contextValidators } from "../validations/shared/contextValidator";

// A function to dynamically load and execute a validation function based on the provided module path and function name
const dynamicValidator = async (
  modulePathWithFunc: string, // The full path to the module and function (e.g., 'module#function')
  element: any, // The payload or element to be validated
  sessionID: string,
  flowId: string,
  usecaseId?: string
) => {
  // Splitting the modulePathWithFunc string into module path and function name
  const [modulePath, functionName] = modulePathWithFunc.split("#");

  try {
    // Dynamically require the module using the resolved path
    const validatorModule = require(modulePath);

    // Retrieve the validation function from the module
    const validatorFunc = functionName ? validatorModule[functionName] : null;

    // Extract action_id from element - ensure it's a string, not null/undefined
    const actionId = element?.action_id || element?.action || "";
    
    // Ensure usecaseId is passed correctly (could be undefined, which is fine for optional param)
    const finalUsecaseId = usecaseId;

    // Log all parameters before calling the function
    console.log("dynamicValidator - About to call function:", {
      functionName,
      functionLength: validatorFunc.length,
      expectedParams: 5,
      params: {
        element: !!element,
        sessionID: typeof sessionID,
        flowId: typeof flowId,
        actionId: typeof actionId,
        usecaseId: typeof finalUsecaseId,
        actionIdValue: actionId,
        usecaseIdValue: finalUsecaseId
      }
    });

    // If the function exists and is valid, invoke it with the element and action
    // Pass usecaseId if the function accepts it (for backward compatibility)
    if (typeof validatorFunc === "function") {
      // Call with all 5 parameters explicitly
      const result = await validatorFunc(
        element,      // param 1
        sessionID,    // param 2
        flowId,       // param 3
        actionId,     // param 4
        finalUsecaseId // param 5 (usecaseId)
      );
      console.log("dynamicValidator - Function call completed, usecaseId was:", finalUsecaseId);
      return result;

    } else {
      // Throw an error if the function is not found within the module

      throw new Error(
        `Validator function '${functionName}' not found in '${modulePath}'`
      );
    }
  } catch (error) {
    // Log any error encountered while loading the module or executing the function
    // logger.error("Error loading validator:", error);
    logger.error("Error in dynamicValidator function. ", {
      error,
      modulePath,
      functionName,
    });
    throw error; // Rethrow the error to be handled by the calling function
  }
};

// Main function that checks the message validation based on the domain and action
export const checkPayload = async (
  domain: string, // The domain (e.g., 'search', 'select') to determine the appropriate validation module
  element: Payload, // The payload or element to be validated
  sessionId: string,
  flowId: string,
  domainConfig: any,
  usecaseId?: string
): Promise<object> => {
  logger.info("Entering checkPayload function.", {
    domain,
    sessionId,
    flowId,
    usecaseId,
  });
  // 0) Always validate common context before any domain/action-specific checks
  const commonCtxResult = await runValidations(contextValidators(), element?.jsonRequest);
  if (!commonCtxResult.ok) {
    return {
      response: {},
      passed: [],
      failed: commonCtxResult.errors,
    };
  }

  // Get the module path and function name based on the version, or fall back to the default configuration
  const modulePathWithFunc = domainConfig?.validationModules;
  // Call the dynamicValidator to load and execute the validation function for the given domain, element, and action
  return dynamicValidator(
    modulePathWithFunc,
    element,
    sessionId,
    flowId,
    usecaseId
  );
};
