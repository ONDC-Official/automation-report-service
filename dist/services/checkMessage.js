"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkMessage = void 0;
const configLoader_1 = require("../utils/configLoader"); // Importing function to load configuration for validation modules
// A function to dynamically load and execute a validation function based on the provided module path and function name
const dynamicValidator = (modulePathWithFunc, // The full path to the module and function (e.g., 'module#function')
element, // The payload or element to be validated
action, // The action to be validated (e.g., 'search', 'init')
sessionID, flowId) => {
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
        }
        else {
            // Throw an error if the function is not found within the module
            throw new Error(`Validator function '${functionName}' not found in '${modulePath}'`);
        }
    }
    catch (error) {
        // Log any error encountered while loading the module or executing the function
        console.error("Error loading validator:", error);
        throw error; // Rethrow the error to be handled by the calling function
    }
};
// Main function that checks the message validation based on the domain and action
const checkMessage = (domain, // The domain (e.g., 'search', 'select') to determine the appropriate validation module
element, // The payload or element to be validated
action, // The specific action to be validated (e.g., 'init', 'confirm')
sessionId, flowId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    // Load the configuration object using the config loader function (cached configuration)
    const config = (0, configLoader_1.loadConfig)();
    // Retrieve the domain-specific configuration from the loaded config
    const domainConfig = config.validationModules[domain];
    // If no validation configuration exists for the specified domain, throw an error
    if (!domainConfig) {
        throw new Error(`No validation modules configured for domain: ${domain}`);
    }
    // Extract the version from the element (payload), defaulting to 'default' if not found
    const version = ((_c = (_b = (_a = element === null || element === void 0 ? void 0 : element.payload) === null || _a === void 0 ? void 0 : _a.jsonRequest) === null || _b === void 0 ? void 0 : _b.context) === null || _c === void 0 ? void 0 : _c.version) || "default";
    // Get the module path and function name based on the version, or fall back to the default configuration
    const modulePathWithFunc = domainConfig[version] || domainConfig["default"];
    // Call the dynamicValidator to load and execute the validation function for the given domain, element, and action
    return dynamicValidator(modulePathWithFunc, element, action, sessionId, flowId);
});
exports.checkMessage = checkMessage;
