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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSearch = checkSearch;
const logger_1 = require("../../../utils/logger");
const assert_1 = __importDefault(require("assert"));
const redisUtils_1 = require("../../../utils/redisUtils");
function checkSearch(element, sessionID, flowId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const payload = element === null || element === void 0 ? void 0 : element.payload;
        const action = (_a = payload === null || payload === void 0 ? void 0 : payload.action) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        logger_1.logger.info(`Inside ${action} validations`);
        const jsonRequest = payload === null || payload === void 0 ? void 0 : payload.jsonRequest;
        const jsonResponse = payload === null || payload === void 0 ? void 0 : payload.jsonResponse;
        const testResults = {
            response: {},
            passed: [],
            failed: [],
        };
        if (jsonResponse === null || jsonResponse === void 0 ? void 0 : jsonResponse.response)
            testResults.response = jsonResponse.response;
        const transactionId = jsonRequest.context.transaction_id;
        yield (0, redisUtils_1.addTransactionId)(sessionID, flowId, transactionId);
        const transactionMap = yield (0, redisUtils_1.getTransactionIds)(sessionID, flowId);
        if (transactionMap.length > 1 && transactionId === transactionMap[1]) {
            logger_1.logger.info(`Validating stops for transactionId: ${transactionId}`);
            const fulfillment = (_c = (_b = jsonRequest === null || jsonRequest === void 0 ? void 0 : jsonRequest.message) === null || _b === void 0 ? void 0 : _b.intent) === null || _c === void 0 ? void 0 : _c.fulfillment;
            console.log(fulfillment);
            try {
                // Fetch fulfillment map
                const stopCodesSet = yield (0, redisUtils_1.fetchData)(sessionID, transactionMap[0], `stopCodesSet`);
                console.log(stopCodesSet);
                if (!stopCodesSet) {
                    logger_1.logger.error("Fulfillment map is empty or not found.");
                    return testResults;
                }
                // Extract stops from the JSON request
                const stops = fulfillment.stops;
                // Validate each stop's location.descriptor.code
                let allStopsValid = true; // Flag to track if all stops are valid
                // Validate each stop's location.descriptor.code
                for (const stop of stops) {
                    const stopCode = (_e = (_d = stop === null || stop === void 0 ? void 0 : stop.location) === null || _d === void 0 ? void 0 : _d.descriptor) === null || _e === void 0 ? void 0 : _e.code;
                    try {
                        // Assert that stopCode is valid (exists in stopCodesSet)
                        assert_1.default.ok(stopCodesSet.includes(stopCode), `Stop code ${stopCode} is not present in on_search_1.`);
                    }
                    catch (error) {
                        testResults.failed.push(error.message);
                        logger_1.logger.error(error.message);
                        allStopsValid = false; // Set flag to false if any stop is invalid
                    }
                }
                // Only push success message if all stops are valid
                if (allStopsValid) {
                    testResults.passed.push(`START AND END are valid stops`);
                }
            }
            catch (error) {
                logger_1.logger.error(`Error during search_2 validation: ${error.message}`);
            }
        }
        // Log success validation for action
        logger_1.logger.info(`Validated ${action}`);
        if (testResults.passed.length < 1)
            testResults.passed.push(`Validated ${action}`);
        return testResults;
    });
}
