"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOnInit = checkOnInit;
const chai_1 = require("chai");
const logger_1 = require("../../../utils/logger");
function checkOnInit(payload) {
    logger_1.logger.info("Inside on_init validations");
    const jsonRequest = payload === null || payload === void 0 ? void 0 : payload.jsonRequest;
    const jsonResponse = payload === null || payload === void 0 ? void 0 : payload.jsonResponse;
    // Store results
    const testResults = {
        response: {},
        passed: [],
        failed: [],
    };
    const { context } = jsonRequest;
    const { message } = jsonRequest;
    // BDD-style validation: context validation
    try {
        // Test: Should have valid context with transactionId and timestamp
        (0, chai_1.expect)(context).to.have.property("transaction_id").that.is.a("string").and
            .is.not.empty;
        (0, chai_1.expect)(context).to.have.property("timestamp").that.is.a("string"); // ISO 8601 format
        testResults.passed.push("Should have valid context with transactionId and timestamp");
    }
    catch (error) {
        testResults.failed.push(`Should have valid context with transactionId and timestamp`);
    }
    // Test: Should have valid message with intent
    try {
        (0, chai_1.expect)(message).to.have.property("intent").that.is.a("string").and.is.not
            .empty;
        testResults.passed.push("Should have valid message with intent");
    }
    catch (error) {
        testResults.failed.push(`Should have valid message with intent`);
    }
    //   // Test: Should have valid searchTerm field
    //   try {
    //     expect(jsonRequest).to.have.property('searchTerm').that.is.a('string').and.is.not.empty;
    //     testResults.passed.push('Should have valid searchTerm field');
    //   } catch (error:any) {
    //     testResults.failed.push({
    //       testName: 'Should have valid searchTerm field',
    //       error: error.message
    //     });
    //   }
    //   // Test: Should have valid query type
    //   try {
    //     expect(jsonRequest).to.have.property('queryType').that.is.a('string').and.is.not.empty;
    //     testResults.passed.push('Should have valid query type');
    //   } catch (error:any) {
    //     testResults.failed.push({
    //       testName: 'Should have valid query type',
    //       error: error.message
    //     });
    //   }
    if (jsonResponse === null || jsonResponse === void 0 ? void 0 : jsonResponse.response)
        testResults.response = jsonResponse === null || jsonResponse === void 0 ? void 0 : jsonResponse.response;
    // Return the result object containing passed and failed tests
    return testResults;
}
