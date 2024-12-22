import { FlowValidationResult, Payload } from "../types/payload";  // Importing types for flow validation results and payload structure
import { flowConfig } from "../config/flowConfig";  // Import flow configuration for the sequence of expected actions
import { checkMessage } from "./checkMessage";  // Import the checkMessage function for validating the actions
import { actions } from "../utils/constants";  // Import available actions for validation
import { ValidationAction } from "../types/actions";  // Import the type for valid validation actions

// Type guard to ensure the action is a valid ValidationAction from the predefined actions list
function isValidAction(action: string): action is ValidationAction {
  return actions.includes(action);
}

// Validation Module for processing grouped payloads and validating their sequence and actions
export async function validationModule(groupedPayloads: {
  [flowId: string]: Payload[];  // Grouping payloads by flowId
}): Promise<{ [flowId: string]: FlowValidationResult }> {  // Return type that contains validation results per flowId
  const requiredSequence = flowConfig["default"];  // Retrieve the required sequence of actions from config
  const finalReport: { [flowId: string]: FlowValidationResult } = {};  // Initialize an object to store the final validation report

  // Iterate through each flowId in the grouped payloads
  for (const flowId in groupedPayloads) {
    const payloads = groupedPayloads[flowId];  // Get the payloads for the current flowId
    const errors: string[] = [];  // Initialize an array to store errors for the flow
    const messages: any = {};  // Initialize an object to store validation messages for each action
    let validSequence = true;  // Flag to track whether the sequence of actions is valid

    // Step 1: Validate Action Sequence for each flow
    for (let i = 0; i < requiredSequence.length; i++) {
        
      let expectedAction = requiredSequence[i];  // Get the expected action from the sequence
      const actualAction = payloads[i]?.action;  // Get the actual action from the current payload

      // If the actual action does not match the expected action, mark the sequence as invalid
      if (actualAction?.toLowerCase() !== expectedAction) {
        if(expectedAction==='select') expectedAction = `select or init`
        validSequence = false;
        errors.push(
          `Error: Expected '${expectedAction}' after '${payloads[i-1].action.toLowerCase()}', but found '${
            actualAction || "undefined"
          }'.`
        );
        break;  // Exit the loop since the sequence is broken
      }
    }

    // Define counters for each action to keep track of the number of occurrences in the sequence
    const actionCounters: Record<ValidationAction, number> = {
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
      const payload = payloads[i];  // Get the current payload from the sequence

      // Convert the action to lowercase and check if it's valid
      const action = payload.action.toLowerCase();

      // Ensure the action is valid before proceeding with validation
      if (isValidAction(action)) {
        const domain = payload?.jsonRequest?.context?.domain;  // Extract domain from the payload for validation

        try {
          // Validate the message based on the domain, payload, and action
          const result = await checkMessage(domain, payload, action);

          // Store the result in the messages object, using action and counter as keys
          messages[`${action}_${actionCounters[action]}`] =
            JSON.stringify(result);

          // Increment the action counter for this action
          actionCounters[action] += 1;
        } catch (error) {
          // Handle errors that occur during the async validation operation
          console.error(
            `Error occurred for action ${action} at index ${i}:`,
            error
          );
        }
      }
    }

    // Step 3: Compile and Store Validation Report for Current Flow
    finalReport[flowId] = {
      valid_flow: validSequence,  // Whether the flow has a valid sequence of actions
      errors,  // List of errors encountered in this flow
      messages,  // List of validation messages for each action
    };
  }

  // Return the final report containing the validation results for all flows
  return finalReport;
}