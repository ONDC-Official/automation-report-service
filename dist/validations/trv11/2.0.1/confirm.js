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
exports.checkConfirm = checkConfirm;
const commonChecks_1 = require("./commonChecks");
const logger_1 = require("../../../utils/logger");
function checkConfirm(element) {
    return __awaiter(this, void 0, void 0, function* () {
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
        const { fulfillments, context, authorization } = jsonRequest;
        // Test: Fulfillments array length should be proportional to selected count where each fulfillment obj will refer to an individual TICKET
        // try {
        //   assert.strictEqual(fulfillments.length, context.selected_count, "Fulfillments array length should be proportional to selected count");
        //   testResults.passed.push("Fulfillments array length is proportional to selected count");
        // } catch (error: any) {
        //   testResults.failed.push(`Fulfillments array length check: ${error.message}`);
        // }
        // // Test: Authorization.valid_to timestamp should be greater than context.timestamp
        // try {
        //   assert.ok(authorization.valid_to > context.timestamp, "Authorization.valid_to timestamp should be greater than context.timestamp");
        //   testResults.passed.push("Authorization.valid_to timestamp is valid");
        // } catch (error: any) {
        //   testResults.failed.push(`Authorization.valid_to timestamp check: ${error.message}`);
        // }
        // Apply common checks for all versions
        const commonResults = yield (0, commonChecks_1.checkCommon)(payload);
        testResults.passed.push(...commonResults.passed);
        testResults.failed.push(...commonResults.failed);
        if (testResults.passed.length < 1)
            testResults.passed.push(`Validated ${action}`);
        return testResults;
    });
}
