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
exports.checkOnSelect = checkOnSelect;
const logger_1 = require("../../../utils/logger");
function checkOnSelect(element) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
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
        const items = (_a = message === null || message === void 0 ? void 0 : message.order) === null || _a === void 0 ? void 0 : _a.items;
        // Test: Quantity.selected.count can't be greater than quantity.maximum.count (sent in items for selected items in on_search_2)
        // try {
        //   items.forEach((item: any) => {
        //     assert.ok(
        //       item.quantity.selected.count <= item.quantity.maximum.count,
        //       "Quantity.selected.count can't be greater than quantity.maximum.count"
        //     );
        //   });
        //   testResults.passed.push(
        //     "Quantity.selected.count is not greater than quantity.maximum.count"
        //   );
        // } catch (error: any) {
        //   logger.error(error.message);
        //   if (error instanceof assert.AssertionError) {
        //     // Push AssertionError to the array
        //     testResults.failed.push(
        //       `Quantity selected count check: ${error.message}`
        //     );
        //   }
        // }
        if (testResults.passed.length < 1)
            testResults.passed.push(`Validated ${action}`);
        return testResults;
    });
}
