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
exports.validationModule = validationModule;
const flowConfig_1 = require("../config/flowConfig"); // Import flow configuration for the sequence of expected actions
const checkMessage_1 = require("./checkMessage"); // Import the checkMessage function for validating the actions
const constants_1 = require("../utils/constants"); // Import available actions for validation
// Type guard to ensure the action is a valid ValidationAction from the predefined actions list
function isValidAction(action) {
    return constants_1.actions.includes(action);
}
// Validation Module for processing grouped payloads and validating their sequence and actions
function validationModule(groupedPayloads, sessionID) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        // Return type that contains validation results per flowId
        const requiredSequence = flowConfig_1.flowConfig["default"]; // Retrieve the required sequence of actions from config
        const finalReport = {}; // Initialize an object to store the final validation report
        // Iterate through each flowId in the grouped payloads
        for (const flowId in groupedPayloads) {
            const payloads = groupedPayloads[flowId]; // Get the payloads for the current flowId
            const errors = []; // Initialize an array to store errors for the flow
            const messages = {}; // Initialize an object to store validation messages for each action
            let validSequence = true; // Flag to track whether the sequence of actions is valid
            // Step 1: Validate Action Sequence for each flow
            for (let i = 0; i < requiredSequence.length; i++) {
                let expectedAction = requiredSequence[i]; // Get the expected action from the sequence
                const actualAction = (_b = (_a = payloads[i]) === null || _a === void 0 ? void 0 : _a.payload) === null || _b === void 0 ? void 0 : _b.action; // Get the actual action from the current payload
                // If the actual action does not match the expected action, mark the sequence as invalid
                if ((actualAction === null || actualAction === void 0 ? void 0 : actualAction.toLowerCase()) !== expectedAction) {
                    if (expectedAction === "select")
                        expectedAction = `select or init`;
                    validSequence = false;
                    errors.push(`Error: Expected '${expectedAction}' after '${(_c = payloads[i - 1].payload) === null || _c === void 0 ? void 0 : _c.action.toLowerCase()}', but found '${actualAction || "undefined"}'.`);
                    break; // Exit the loop since the sequence is broken
                }
            }
            // Define counters for each action to keep track of the number of occurrences in the sequence
            const actionCounters = {
                search: 1,
                on_search: 1,
                select: 1,
                on_select: 1,
                init: 1,
                on_init: 1,
                confirm: 1,
                on_confirm: 1,
                cancel: 1,
                on_cancel: 1,
                update: 1,
                on_update: 1,
                on_status: 1,
            };
            // Step 2: Process Each Payload Using checkMessage
            for (let i = 0; i < payloads.length; i++) {
                const element = payloads[i]; // Get the current payload from the sequence
                // Convert the action to lowercase and check if it's valid
                const action = element === null || element === void 0 ? void 0 : element.payload.action.toLowerCase();
                // Ensure the action is valid before proceeding with validation
                if (isValidAction(action)) {
                    const domain = (_f = (_e = (_d = element === null || element === void 0 ? void 0 : element.payload) === null || _d === void 0 ? void 0 : _d.jsonRequest) === null || _e === void 0 ? void 0 : _e.context) === null || _f === void 0 ? void 0 : _f.domain; // Extract domain from the payload for validation
                    try {
                        // Validate the message based on the domain, payload, and action
                        const result = yield (0, checkMessage_1.checkMessage)(domain, element, action, sessionID, flowId);
                        // Store the result in the messages object, using action and counter as keys
                        messages[`${action}_${actionCounters[action]}`] =
                            JSON.stringify(result);
                        // Increment the action counter for this action
                        actionCounters[action] += 1;
                    }
                    catch (error) {
                        // Handle errors that occur during the async validation operation
                        console.error(`Error occurred for action ${action} at index ${i}:`, error);
                    }
                }
            }
            // Step 3: Compile and Store Validation Report for Current Flow
            finalReport[flowId] = {
                valid_flow: validSequence, // Whether the flow has a valid sequence of actions
                errors, // List of errors encountered in this flow
                messages, // List of validation messages for each action
            };
        }
        // Return the final report containing the validation results for all flows
        return finalReport;
    });
}
