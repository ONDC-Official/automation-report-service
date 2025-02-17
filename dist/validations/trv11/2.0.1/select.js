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
exports.checkSelect = checkSelect;
const assert_1 = __importDefault(require("assert"));
const logger_1 = require("../../../utils/logger");
const redisUtils_1 = require("../../../utils/redisUtils");
function checkSelect(element, sessionID, flowId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const payload = element === null || element === void 0 ? void 0 : element.payload;
        const action = payload === null || payload === void 0 ? void 0 : payload.action.toLowerCase();
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
        console.log(JSON.stringify(message));
        const transactionId = (_a = jsonRequest.context) === null || _a === void 0 ? void 0 : _a.transaction_id;
        logger_1.logger.info("Validating items in select");
        const items = (_b = message === null || message === void 0 ? void 0 : message.order) === null || _b === void 0 ? void 0 : _b.items;
        const onSearchItems = yield (0, redisUtils_1.fetchData)(sessionID, transactionId, "onSearchItemArr");
        if (onSearchItems) {
            // Validate each item's `quantity.selected.count` against the catalog's `quantity.maximum.count`
            for (const item of items) {
                const catalogItem = onSearchItems.value.find((catItem) => (catItem === null || catItem === void 0 ? void 0 : catItem.id) === (item === null || item === void 0 ? void 0 : item.id));
                if (!catalogItem) {
                    console.error(`Catalog item with ID ${item.id} not found.`);
                    continue;
                }
                try {
                    // Assert that selected count is less than or equal to maximum count
                    assert_1.default.ok(item.quantity.selected.count <= catalogItem.quantity.maximum.count, `Item ${item === null || item === void 0 ? void 0 : item.id}: Selected count (${item.quantity.selected.count}) exceeds the maximum count (${catalogItem.quantity.maximum.count}) in the catalog.`);
                    testResults.passed.push(`Valid item quantity for item id: ${item === null || item === void 0 ? void 0 : item.id}`);
                }
                catch (error) {
                    logger_1.logger.error(error.message);
                    testResults.failed.push(`${error.message}`);
                }
            }
        }
        if (testResults.passed.length < 1)
            testResults.passed.push(`Validated ${action}`);
        return testResults;
    });
}
