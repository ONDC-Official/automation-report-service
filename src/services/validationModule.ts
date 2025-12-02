import {
  FlowValidationResult,
  WrappedPayload,
  Report,
  Payload,
  TestResult,
} from "../types/payload";
import { loadConfig } from "../utils/configLoader";
import { actions } from "../utils/constants";
import { ValidationAction } from "../types/actions";
import logger from "@ondc/automation-logger";
import { MESSAGES } from "../utils/messages";
import { RedisService } from "ondc-automation-cache-lib";
import { checkPayload } from "./checkPayload";

// Type guard to ensure the action is a valid ValidationAction from the predefined actions list
function isValidAction(action: string): action is ValidationAction {
  return actions.includes(action);
}

// Pre-computed action counters for better performance
const INITIAL_ACTION_COUNTERS: Record<ValidationAction, number> = {
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
  status: 1,
  track: 1,
  on_track: 1,
};

// Interface for session details
interface SessionDetails {
  domain: string;
  version: string;
}

// Interface for domain configuration
interface DomainConfig {
  flows: Record<string, string[]>;
  optional_flows?: string[];
  validationModules?: string;
}

/**
 * Retrieves and parses session details from Redis
 */
async function getSessionDetails(
  sessionID: string
): Promise<SessionDetails | null> {
  try {
    const sessionData = await RedisService.getKey(
      `sessionDetails:${sessionID}`
    );
    return sessionData ? JSON.parse(sessionData) : null;
  } catch (error) {
    logger.error("Failed to retrieve session details", error, { sessionID });
    return null;
  }
}

/**
 * Checks if all mandatory flows are tested
 */
function checkMandatoryFlows(
  testedFlows: string[],
  domainConfig: DomainConfig,
  report: Report
): void {
  if (!Array.isArray(testedFlows)) {
    logger.error("testedFlows is not an array or is undefined", { testedFlows });
    return;
  }

  const allFlows = Object.keys(domainConfig?.flows || {});
  const mandatoryFlows: string[] = [];

  for (const flowId of allFlows) {
    if (!testedFlows.includes(flowId)) {
      const isOptional =
        Array.isArray(domainConfig?.optional_flows) &&
        domainConfig.optional_flows.includes(flowId);

      if (!isOptional) {
        mandatoryFlows.push(flowId);
      }
    }
  }
  if (mandatoryFlows.length > 0) {
    report.finalReport.mandatoryFlows = `${mandatoryFlows.join(
      ", "
    )} is/are mandatory and should be tested.`;
  }
}

/**
 * Validates the action sequence for a flow
 * Handles HTML_FORM entries by skipping them in the sequence but maintaining position tracking
 */
function validateActionSequence(
  payloads: Payload[],
  requiredSequence: string[]
): { validSequence: boolean; errors: string[] } {
  const errors: string[] = [];
  let validSequence = true;

  try {
    let payloadIndex = 0; // Index for actual payloads (excluding HTML_FORM)
    
    // Log for debugging
    logger.info("Validating action sequence", {
      requiredSequenceLength: requiredSequence.length,
      payloadsLength: payloads.length,
      requiredSequence: requiredSequence,
      payloadActions: payloads.map((p, idx) => ({
        index: idx,
        action: p?.action?.toLowerCase(),
        transactionId: p?.transactionId
      }))
    });
    
    for (let i = 0; i < requiredSequence.length; i++) {
      const expectedAction = requiredSequence[i].toLowerCase();
      
      // Skip HTML_FORM entries in the required sequence - they don't have corresponding payloads
      if (expectedAction === "html_form") {
        logger.info(`Skipping HTML_FORM at sequence position ${i + 1}`);
        // HTML_FORM is expected, so we just skip it and continue
        continue;
      }

      // Check if we have enough payloads
      if (payloadIndex >= payloads.length) {
        validSequence = false;
        errors.push(
          `Error: Expected '${expectedAction}' but no more payloads found. Sequence position: ${i + 1}`
        );
        break;
      }

      const actualAction = payloads[payloadIndex]?.action?.toLowerCase();

      if (actualAction !== expectedAction) {
        // For better error message, check if this is a select/init ambiguity
        let displayExpectedAction = expectedAction;
        if (expectedAction === "select") {
          displayExpectedAction = "select or init";
        }
        
        validSequence = false;
        
        // Find the previous non-HTML_FORM action for better error message
        let previousAction = "start";
        for (let j = i - 1; j >= 0; j--) {
          const prevAction = requiredSequence[j].toLowerCase();
          if (prevAction !== "html_form") {
            previousAction = prevAction;
            break;
          }
        }
        
        // Also check if there's an HTML_FORM right before this expected action
        const hasHtmlFormBefore = i > 0 && requiredSequence[i - 1]?.toLowerCase() === "html_form";
        
        // Check if we're ahead in payloads (missing action scenario)
        // Look ahead to see if the expected action appears later
        let foundLater = false;
        let foundAtPosition = -1;
        for (let k = payloadIndex + 1; k < payloads.length; k++) {
          if (payloads[k]?.action?.toLowerCase() === expectedAction) {
            foundLater = true;
            foundAtPosition = k;
            break;
          }
        }
        
        // Build context for debugging
        const sequenceContext = requiredSequence.slice(Math.max(0, i - 3), Math.min(i + 4, requiredSequence.length));
        const payloadContext = payloads.slice(Math.max(0, payloadIndex - 2), Math.min(payloadIndex + 3, payloads.length))
          .map((p, idx) => ({
            relativeIndex: idx - Math.max(0, payloadIndex - 2),
            action: p?.action?.toLowerCase(),
            transactionId: p?.transactionId
          }));
        
        logger.error("Action sequence mismatch - Detailed Debug", {
          sequencePosition: i + 1,
          expectedAction,
          actualAction,
          previousAction,
          payloadIndex,
          hasHtmlFormBefore,
          foundLater,
          foundAtPosition,
          sequenceContext: sequenceContext.map((s, idx) => ({
            pos: Math.max(0, i - 3) + idx,
            action: s,
            isCurrent: Math.max(0, i - 3) + idx === i
          })),
          payloadContext,
          fullRequiredSequence: requiredSequence,
          fullPayloadActions: payloads.map(p => p?.action?.toLowerCase())
        });
        
        let errorMessage = `Error: Expected '${displayExpectedAction}' after '${previousAction}'`;
        if (hasHtmlFormBefore) {
          errorMessage += ` (HTML_FORM was skipped)`;
        }
        if (foundLater) {
          errorMessage += `. Note: '${expectedAction}' action found later at payload position ${foundAtPosition + 1}, suggesting a missing action in the sequence.`;
        }
        errorMessage += `, but found '${actualAction || "undefined"}'.`;
        
        errors.push(errorMessage);
        break;
      }

      // Move to next payload only if we matched a non-HTML_FORM action
      payloadIndex++;
    }
  } catch (error) {
    logger.error("Error occurred during action sequence validation", error, { requiredSequence });
    validSequence = false;
    errors.push("Error occurred during action sequence validation");
  }

  return { validSequence, errors };
}

/**
 * Processes payloads and validates them using checkPayload
 * Also handles HTML_FORM validations inline when they appear in the sequence
 */
async function processPayloads(
  payloads: Payload[],
  sessionID: string,
  flowId: string,
  domainConfig: DomainConfig,
  requiredSequence?: string[]
): Promise<Record<string, string>> {
  const messages: Record<string, string> = {};
  const actionCounters = { ...INITIAL_ACTION_COUNTERS };
  let payloadIndex = 0; // Track actual payloads
  let htmlFormCounter = 0; // Track HTML_FORM occurrences

  // If we have a required sequence, process in sequence order
  if (requiredSequence && requiredSequence.length > 0) {
    const transactionId = payloads[0]?.transactionId || payloads[0]?.jsonRequest?.context?.transaction_id;
    
    for (let seqIndex = 0; seqIndex < requiredSequence.length; seqIndex++) {
      const expectedAction = requiredSequence[seqIndex].toLowerCase();
      
      // Handle HTML_FORM validation inline
      if (expectedAction === "html_form") {
        htmlFormCounter++;
        
        try {
          const { validateHTMLForm } = await import("../validations/shared/formValidations");
          const htmlFormTestResults: TestResult = { response: {}, passed: [], failed: [] };
          
          if (transactionId) {
            await validateHTMLForm(sessionID, transactionId, flowId, htmlFormTestResults);
            messages[`html_form_${htmlFormCounter}`] = JSON.stringify({
              passed: htmlFormTestResults.passed,
              failed: htmlFormTestResults.failed,
            });
          } else {
            htmlFormTestResults.failed.push("Transaction ID not found for HTML_FORM validation");
            messages[`html_form_${htmlFormCounter}`] = JSON.stringify({
              passed: [],
              failed: htmlFormTestResults.failed,
            });
          }
        } catch (error: any) {
          logger.error(`Error validating HTML_FORM ${htmlFormCounter}`, error);
          messages[`html_form_${htmlFormCounter}`] = JSON.stringify({
            passed: [],
            failed: [`HTML_FORM validation error: ${error.message}`],
          });
        }
        continue; // Skip to next sequence item
      }

      // Process actual payload
      if (payloadIndex >= payloads.length) {
        logger.info(`No more payloads available at sequence position ${seqIndex + 1}`,
          {meta: { flowId, seqIndex: seqIndex + 1 }}
        );
        break;
      }

      const element = payloads[payloadIndex];
      const action = element?.action?.toLowerCase();

      if (!isValidAction(action)) {
        logger.error(`Invalid action: ${action}`, { flowId, action, index: payloadIndex });
        payloadIndex++;
        continue;
      }

      const domain = element?.jsonRequest?.context?.domain;

      try {
        const result = await checkPayload(
          domain,
          element,
          sessionID,
          flowId,
          domainConfig
        );

        messages[`${action}_${actionCounters[action]}`] = JSON.stringify(result);
        actionCounters[action] += 1;
      } catch (error) {
        logger.error(`Error occurred for action ${action} at index ${payloadIndex}`, error, { flowId, action, index: payloadIndex });
      }

      payloadIndex++;
    }
  } else {
    // Fallback: process payloads without sequence (original behavior)
    for (let i = 0; i < payloads.length; i++) {
      const element = payloads[i];
      const action = element?.action?.toLowerCase();

      if (!isValidAction(action)) {
        logger.error(`Invalid action: ${action}`, { flowId, action, index: i });
        continue;
      }

      const domain = element?.jsonRequest?.context?.domain;

      try {
        const result = await checkPayload(
          domain,
          element,
          sessionID,
          flowId,
          domainConfig
        );

        messages[`${action}_${actionCounters[action]}`] = JSON.stringify(result);
        actionCounters[action] += 1;
      } catch (error) {
        logger.error(`Error occurred for action ${action} at index ${i}`, error, { flowId, action, index: i });
      }
    }
  }

  return messages;
}

// Main validation module function
export async function validationModule(
  groupedPayloads: Record<string, Payload[]>,
  sessionID: string
): Promise<Report> {
  logger.info(MESSAGES.services.validationEnter, { sessionID, flowCount: Object.keys(groupedPayloads).length });

  const report: Report = { finalReport: {}, flowErrors: {} };
  const flowsReport: Record<string, FlowValidationResult> = {};
  const testedFlows = Object.keys(groupedPayloads);

  // Get session details and domain configuration
  const sessionDetails = await getSessionDetails(sessionID);
  const domainConfig: DomainConfig = sessionDetails
    ? loadConfig(sessionDetails.domain, sessionDetails.version)
    : { flows: {} };

  // Check mandatory flows
  try {
    logger.info(MESSAGES.validations.checkingMandatoryFlows, { testedFlows });

    checkMandatoryFlows(testedFlows, domainConfig, report);

    logger.info(MESSAGES.validations.mandatoryFlowsDone, { testedFlows });
  } catch (error: any) {
    logger.error("Error checking mandatory flows", error, { testedFlows });
  }
  // Process each flow
  for (const flowId in groupedPayloads) {
    const requiredSequence = domainConfig?.flows?.[flowId];
    const payloads = groupedPayloads[flowId];

    logger.info(MESSAGES.validations.actionValidationStart(flowId), { flowId });

    // Step 1: Validate action sequence
    const { validSequence, errors } = validateActionSequence(
      payloads,
      requiredSequence || []
    );

    logger.info(MESSAGES.validations.actionValidationDone(flowId), { flowId });

    // Step 2: Process payloads (HTML_FORM validations are now handled inline)
    const messages = await processPayloads(
      payloads,
      sessionID,
      flowId,
      domainConfig,
      requiredSequence
    );

    logger.info(MESSAGES.validations.payloadProcessingDone(flowId), { flowId });

    // Step 3: Store validation results
    flowsReport[flowId] = {
      valid_flow: validSequence,
      errors,
      messages,
    };
  }

  report.flowErrors = flowsReport;

  logger.info(MESSAGES.services.validationExit, { sessionID, flowCount: Object.keys(flowsReport).length });

  return report;
}
