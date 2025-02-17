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
exports.checkOnSearch = checkOnSearch;
const logger_1 = require("../../../utils/logger");
const redisUtils_1 = require("../../../utils/redisUtils");
const assert_1 = __importDefault(require("assert"));
function checkOnSearch(element, sessionID, flowId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const payload = element === null || element === void 0 ? void 0 : element.payload;
        if (!payload) {
            logger_1.logger.error("Payload is missing");
            return { response: {}, passed: [], failed: ["Payload is missing"] };
        }
        const action = (_a = payload === null || payload === void 0 ? void 0 : payload.action) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        logger_1.logger.info(`Inside ${action} validations`);
        const testResults = {
            response: {},
            passed: [],
            failed: [],
        };
        const { jsonRequest, jsonResponse } = payload;
        if (jsonResponse === null || jsonResponse === void 0 ? void 0 : jsonResponse.response)
            testResults.response = jsonResponse === null || jsonResponse === void 0 ? void 0 : jsonResponse.response;
        const { message } = jsonRequest;
        const transactionId = (_b = jsonRequest.context) === null || _b === void 0 ? void 0 : _b.transaction_id;
        const transactionMap = yield (0, redisUtils_1.getTransactionIds)(sessionID, flowId);
        const providers = ((_c = message.catalog) === null || _c === void 0 ? void 0 : _c.providers) || [];
        const fulfillmentMap = new Map();
        // Iterate over providers
        for (const provider of providers) {
            const fulfillments = provider.fulfillments || [];
            const items = provider.items || [];
            // Check for on_search_1
            if (transactionId === transactionMap[0]) {
                logger_1.logger.info("Validating fulfillments for on_search_1");
                try {
                    assert_1.default.ok(fulfillments.every((fulfillment) => fulfillment.type === "ROUTE"), "Fulfillments.type should be ROUTE");
                    testResults.passed.push("Fulfillments.type is ROUTE");
                    // Populate fulfillment map
                    for (const fulfillment of fulfillments) {
                        if (fulfillment.stops) {
                            const stopCodesSet = new Set(fulfillment.stops.map((stop) => { var _a, _b; return (_b = (_a = stop.location) === null || _a === void 0 ? void 0 : _a.descriptor) === null || _b === void 0 ? void 0 : _b.code; }));
                            // Convert the Set back to an array to store the unique codes
                            const uniqueStopCodes = Array.from(stopCodesSet);
                            yield (0, redisUtils_1.saveData)(sessionID, transactionId, `stopCodesSet`, uniqueStopCodes);
                        }
                    }
                }
                catch (error) {
                    logger_1.logger.error(`Error during on_search_1 validation: ${error.message}`);
                    testResults.failed.push(`${error.message}`);
                }
            }
            // Check for on_search_2
            if (transactionMap.length > 1 && transactionId === transactionMap[1]) {
                logger_1.logger.info("Validating fulfillments for on_search_2");
                try {
                    assert_1.default.ok(fulfillments.every((fulfillment) => fulfillment.type === "TRIP"), "Fulfillments.type should be TRIP");
                    testResults.passed.push("Fulfillments.type is TRIP");
                }
                catch (error) {
                    logger_1.logger.error(`Error during on_search_2 validation: ${error.message}`);
                    testResults.failed.push(`${error.message}`);
                }
            }
            logger_1.logger.info("Validating items for on_search_2");
            try {
                yield (0, redisUtils_1.saveData)(sessionID, transactionId, "onSearchItemArr", { value: items });
            }
            catch (error) {
                logger_1.logger.error(error);
            }
            try {
                assert_1.default.ok(items.every((item) => { var _a, _b, _c, _d; return ((_b = (_a = item === null || item === void 0 ? void 0 : item.quantity) === null || _a === void 0 ? void 0 : _a.minimum) === null || _b === void 0 ? void 0 : _b.count) < ((_d = (_c = item === null || item === void 0 ? void 0 : item.quantity) === null || _c === void 0 ? void 0 : _c.maximum) === null || _d === void 0 ? void 0 : _d.count); }, "Quantity.minimum.count can't be greater than quantity.maximum.count at items."));
                testResults.passed.push("Valid items/quantity maximum and minimum count");
            }
            catch (error) {
                logger_1.logger.error(`Error during on_search_2 validation: ${error.message}`);
                testResults.failed.push(`${error.message}`);
            }
        }
        if (testResults.passed.length < 1)
            testResults.passed.push(`Validated ${action}`);
        return testResults;
    });
}
