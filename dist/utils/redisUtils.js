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
exports.getTransactionIds = exports.addTransactionId = exports.fetchData = exports.saveData = void 0;
const ondc_automation_cache_lib_1 = require("ondc-automation-cache-lib");
const logger_1 = require("./logger");
// Function to save data under sessionId and transactionId
const saveData = (sessionId, transactionId, key, value // Accept JSON object
) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Create a unique key in the format sessionId:transactionId:key
        const redisKey = `${sessionId}:${transactionId}:${key}`;
        // Serialize the JSON object to a string
        const serializedValue = JSON.stringify(value);
        // Save the serialized value with optional TTL
        yield ondc_automation_cache_lib_1.RedisService.setKey(redisKey, serializedValue, 3600);
    }
    catch (error) {
        logger_1.logger.error("Error saving data:", error);
    }
});
exports.saveData = saveData;
// Function to fetch data for a specific key under sessionId and transactionId
const fetchData = (sessionId, transactionId, key) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const redisKey = `${sessionId}:${transactionId}:${key}`;
        // Fetch the serialized value
        const serializedValue = yield ondc_automation_cache_lib_1.RedisService.getKey(redisKey);
        if (!serializedValue) {
            logger_1.logger.error(`No data found for key: ${redisKey}`);
            return null;
        }
        // Deserialize the JSON object
        const value = JSON.parse(serializedValue);
        return value;
    }
    catch (error) {
        logger_1.logger.error("Error fetching data:", error);
        return null;
    }
});
exports.fetchData = fetchData;
const sessionTransactionMap = new Map();
/**
 * Add a transaction ID to a session's flow.
 * @param {string} sessionId - The session ID.
 * @param {string} flowId - The flow ID.
 * @param {string} transactionId - The transaction ID to add.
 */
const addTransactionId = (sessionId, flowId, transactionId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Check if the sessionId exists; initialize with a new Map containing the flowId if it doesn't
    if (!sessionTransactionMap.has(sessionId)) {
        const flowMap = new Map();
        flowMap.set(flowId, []); // Initialize the flowId with an empty array
        sessionTransactionMap.set(sessionId, flowMap);
    }
    // Get the flow map for the session
    const flowMap = sessionTransactionMap.get(sessionId);
    // Ensure the flow exists in the session
    if (!(flowMap === null || flowMap === void 0 ? void 0 : flowMap.has(flowId))) {
        flowMap === null || flowMap === void 0 ? void 0 : flowMap.set(flowId, []);
    }
    // Add the transaction ID to the flow's array
    (_a = flowMap === null || flowMap === void 0 ? void 0 : flowMap.get(flowId)) === null || _a === void 0 ? void 0 : _a.push({ transactionId });
    // Convert the nested structure to an object for storage in Redis
    const sessionData = Object.fromEntries(Array.from((flowMap === null || flowMap === void 0 ? void 0 : flowMap.entries()) || []).map(([key, value]) => [key, value]));
    yield ondc_automation_cache_lib_1.RedisService.setKey(`${sessionId}:transactionMap`, JSON.stringify(sessionData));
});
exports.addTransactionId = addTransactionId;
/**
 * Get all transaction IDs for a specific session and flow.
 * @param {string} sessionId - The session ID.
 * @param {string} flowId - The flow ID.
 * @returns {Promise<string[]>} - Array of transaction IDs for the session and flow.
 */
const getTransactionIds = (sessionId, flowId) => __awaiter(void 0, void 0, void 0, function* () {
    // Retrieve session data from Redis
    const sessionTransactionData = yield ondc_automation_cache_lib_1.RedisService.getKey(`${sessionId}:transactionMap`);
    if (!sessionTransactionData) {
        logger_1.logger.error(`No transaction data found for session "${sessionId}".`);
        return [];
    }
    // Parse the data as a nested object structure
    const sessionData = JSON.parse(sessionTransactionData);
    // Check if the flowId exists in the session data
    const transactions = sessionData[flowId];
    if (!transactions) {
        logger_1.logger.error(`No transactions found for flow "${flowId}" in session "${sessionId}".`);
        return [];
    }
    // Extract only the transactionId values and return them
    return transactions.map((transaction) => transaction.transactionId);
});
exports.getTransactionIds = getTransactionIds;
