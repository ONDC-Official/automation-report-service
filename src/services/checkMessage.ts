import { loadConfig } from "../utils/configLoader";

const dynamicValidator = (
  modulePathWithFunc: string,
  element: any,
  action: string
) => {
  const [modulePath, functionName] = modulePathWithFunc.split("#");

  try {
    const validatorModule = require(modulePath);

    const validatorFunc = functionName ? validatorModule[functionName] : null;

    if (typeof validatorFunc === "function") {
      return validatorFunc(element, action);
    } else {
      throw new Error(
        `Validator function '${functionName}' not found in '${modulePath}'`
      );
    }
  } catch (error) {
    console.error("Error loading validator:", error);
    throw error;
  }
};

// Main function
export const checkMessage = async (
  domain: string,
  element: any,
  action: string
): Promise<object> => {
  const config = loadConfig(); // Use cached configuration
  const domainConfig = config.validationModules[domain];

  if (!domainConfig) {
    throw new Error(`No validation modules configured for domain: ${domain}`);
  }

  const version = element?.jsonRequest?.context?.version || "default";

  const modulePathWithFunc = domainConfig[version] || domainConfig["default"];

  return dynamicValidator(modulePathWithFunc, element, action);
};
