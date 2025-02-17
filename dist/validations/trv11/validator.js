"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.validate = void 0;
const logger_1 = require("../../utils/logger"); // Importing logger utility to log errors
const responseSchemaValidator_1 = require("./responseSchemaValidator"); // Importing function to validate JSON response schema
// Main validation function that processes the given payload based on the action
const validate = (element, // The payload object that contains the data to be validated
action, // The action type that specifies which validation test to run
sessionID, flowId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    // Extracting version from the JSON request context
    const version = (_c = (_b = (_a = element === null || element === void 0 ? void 0 : element.payload) === null || _a === void 0 ? void 0 : _a.jsonRequest) === null || _b === void 0 ? void 0 : _b.context) === null || _c === void 0 ? void 0 : _c.version;
    // Initializing an object to store test results (passed, failed, and response data)
    let testResults = { response: {}, passed: [], failed: [] };
    try {
        const { jsonResponse } = element === null || element === void 0 ? void 0 : element.payload;
        // If a JSON response is available, validate its schema
        if (jsonResponse) {
            (0, responseSchemaValidator_1.checkJsonResponse)(jsonResponse, testResults); // Check the schema of the response
        }
        // Dynamically import test files based on the version
        try {
            const { checkSearch } = yield Promise.resolve(`${`./${version}/search`}`).then(s => __importStar(require(s))); // Importing the 'search' test based on the version
            const { checkOnSearch } = yield Promise.resolve(`${`./${version}/OnSearch`}`).then(s => __importStar(require(s))); // Importing the 'on_search' test based on the version
            const { checkSelect } = yield Promise.resolve(`${`./${version}/select`}`).then(s => __importStar(require(s))); // Importing the 'select' test based on the version
            const { checkOnSelect } = yield Promise.resolve(`${`./${version}/OnSelect`}`).then(s => __importStar(require(s))); // Importing the 'on_select' test based on the version
            const { checkInit } = yield Promise.resolve(`${`./${version}/init`}`).then(s => __importStar(require(s))); // Importing the 'init' test based on the version
            const { checkOnInit } = yield Promise.resolve(`${`./${version}/OnInit`}`).then(s => __importStar(require(s))); // Importing the 'on_init' test based on the version
            const { checkConfirm } = yield Promise.resolve(`${`./${version}/confirm`}`).then(s => __importStar(require(s))); // Importing the 'confirm' test based on the version
            const { checkOnConfirm } = yield Promise.resolve(`${`./${version}/OnConfirm`}`).then(s => __importStar(require(s))); // Importing the 'on_confirm' test based on the version
            const { checkOnStatus } = yield Promise.resolve(`${`./${version}/OnStatus`}`).then(s => __importStar(require(s))); // Importing the 'on_status' test based on the version
            // Helper function to run a specific test and handle its result
            const runTest = (testFunction, // The specific test function to be executed
            element, // The payload to be passed to the test function
            testResults // The test results object to be updated
            ) => __awaiter(void 0, void 0, void 0, function* () {
                try {
                    // Execute the test function and wait for the result
                    const testResult = yield testFunction(element, sessionID, flowId);
                    // Add passed and failed results to the test results
                    testResults.passed.push(...testResult.passed);
                    testResults.failed.push(...testResult.failed);
                    // If the test provides a response, update the response in test results
                    if (testResult.response) {
                        testResults.response = testResult.response;
                    }
                }
                catch (err) {
                    // If an error occurs in the test function, add it to the failed results
                    testResults.failed.push(`Test function error: ${err.message}`);
                    // Log the stack trace for debugging
                    logger_1.logger.error(`Test function error: ${err.stack}`);
                }
            });
            // Switch statement to determine which action test to execute
            switch (action) {
                case "search":
                    yield runTest(checkSearch, element, testResults);
                    break;
                case "on_search":
                    yield runTest(checkOnSearch, element, testResults);
                    break;
                case "select":
                    yield runTest(checkSelect, element, testResults);
                    break;
                case "on_select":
                    yield runTest(checkOnSelect, element, testResults);
                    break;
                case "init":
                    yield runTest(checkInit, element, testResults);
                    break;
                case "on_init":
                    yield runTest(checkOnInit, element, testResults);
                    break;
                case "confirm":
                    yield runTest(checkConfirm, element, testResults);
                    break;
                case "on_confirm":
                    yield runTest(checkOnConfirm, element, testResults);
                    break;
                case "on_status":
                    yield runTest(checkOnStatus, element, testResults);
                    break;
                default:
                    // If the action is not recognized, add a failure message
                    testResults.failed.push(`No matching test function found for ${action}.`);
                    break;
            }
        }
        catch (err) {
            // If an error occurs during the dynamic import of version-specific tests, log the error and add a failure message
            testResults.failed.push(`Incorrect version for ${action}`);
            logger_1.logger.error(`Error importing version-specific tests: ${err.stack}`);
        }
        // Return the final test results (response, passed, failed)
        return testResults;
    }
    catch (error) {
        // Log any unexpected errors that occur during validation
        logger_1.logger.error(`Error during validation: ${error.message}`);
        // Return a result indicating failure in test execution
        return {
            response: {},
            passed: [],
            failed: [`Error during ${action} test execution`],
        };
    }
});
exports.validate = validate;
