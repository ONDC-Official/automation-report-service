import { FlowValidationResult, Payload } from "../types/payload";
import { flowConfig } from "../config/flowConfig";
import { checkMessage } from "./checkMessage";
import { actions } from "../utils/constants";
import { ValidationAction } from "../types/actions";



// Type guard to narrow the action to a valid ValidationAction
function isValidAction(action: string): action is ValidationAction {
  return actions.includes(action);
}

// Validation Module
export async function validationModule(groupedPayloads: {
  [flowId: string]: Payload[];
}): Promise<{ [flowId: string]: FlowValidationResult }> {
  const requiredSequence = flowConfig["default"];
  const finalReport: { [flowId: string]: FlowValidationResult } = {};

  for (const flowId in groupedPayloads) {
    const payloads = groupedPayloads[flowId];
    const errors: string[] = [];
    const messages: any = {};
    let validSequence = true;

    // Step 1: Validate Sequence
    for (let i = 0; i < requiredSequence.length; i++) {
        
      const expectedAction = requiredSequence[i];
      const actualAction = payloads[i]?.action;

      if (actualAction?.toLowerCase() !== expectedAction) {
        validSequence = false;
        errors.push(
          `Error: Expected '${expectedAction}' after '${payloads[i-1].action.toLowerCase()}', but found '${
            actualAction || "undefined"
          }'.`
        );
        break;
      }
    }

    // Define the actionCounters type using an index signature
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
      const payload = payloads[i];

      // Convert action to lowercase and check if it's a valid action
      const action = payload.action.toLowerCase();

      // Ensure that the action is valid before proceeding
      if (isValidAction(action)) {
        const domain = payload?.jsonRequest?.context?.domain;

        try {
          // Check the message for the given action
          const result = await checkMessage(domain, payload, action);

          // Use the action and the incremented index in the messages object
          messages[`${action}_${actionCounters[action]}`] =
            JSON.stringify(result);

          // Increment the counter for this action
          actionCounters[action] += 1;
        } catch (error) {
          // Handle any errors during async operation
          console.error(
            `Error occurred for action ${action} at index ${i}:`,
            error
          );
        }
      }
    }

    // Step 3: Compile Report
    finalReport[flowId] = {
      valid_flow: validSequence,
      errors,
      messages,
    };
  }

  return finalReport;
}
