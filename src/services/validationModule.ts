import {
  FlowValidationResult,
  WrappedPayload,
  Report,
  Payload,
} from "../types/payload";
import { loadConfig } from "../utils/configLoader";
import { actions } from "../utils/constants";
import { ValidationAction } from "../types/actions";
import { logError, logger, logInfo } from "../utils/logger";
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
async function getSessionDetails(sessionID: string): Promise<SessionDetails | null> {
  try {
    const sessionData = await RedisService.getKey(`sessionDetails:${sessionID}`);
    return sessionData ? JSON.parse(sessionData) : null;
  } catch (error) {
    logError({
      message: "Failed to retrieve session details",
      error,
      meta: { sessionID },
    });
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
    logError({
      message: "testedFlows is not an array or is undefined",
      meta: { testedFlows },
    });
    return;
  }

  const allFlows = Object.keys(domainConfig?.flows || {});
  const mandatoryFlows: string[] = [];

  for (const flowId of allFlows) {
    if (!testedFlows.includes(flowId)) {
      const isOptional = Array.isArray(domainConfig?.optional_flows) && 
                        domainConfig.optional_flows.includes(flowId);
      
      if (!isOptional) {
        mandatoryFlows.push(flowId);
      }
    }
  }

  if (mandatoryFlows.length > 0) {
    report.finalReport.mandatoryFlows = `${mandatoryFlows.join(', ')} is/are mandatory and should be tested.`;
  }
}

/**
 * Validates the action sequence for a flow
 */
function validateActionSequence(
  payloads: Payload[],
  requiredSequence: string[]
): { validSequence: boolean; errors: string[] } {
  const errors: string[] = [];
  let validSequence = true;

  try {
    for (let i = 0; i < requiredSequence.length; i++) {
      const expectedAction = requiredSequence[i];
      const actualAction = payloads[i]?.action;

      if (actualAction?.toLowerCase() !== expectedAction) {
        const displayExpectedAction = expectedAction === "select" ? "select or init" : expectedAction;
        validSequence = false;
        errors.push(
          `Error: Expected '${displayExpectedAction}' after '${payloads[i - 1]?.action?.toLowerCase() || 'start'}', but found '${actualAction?.toLowerCase() || "undefined"}'.`
        );
        break;
      }
    }
  } catch (error) {
    logError({
      message: "Error occurred during action sequence validation",
      error,
      meta: { requiredSequence },
    });
    validSequence = false;
    errors.push("Error occurred during action sequence validation");
  }

  return { validSequence, errors };
}

/**
 * Processes payloads and validates them using checkPayload
 */
async function processPayloads(
  payloads: Payload[],
  sessionID: string,
  flowId: string,
  domainConfig: DomainConfig
): Promise<Record<string, string>> {
  const messages: Record<string, string> = {};
  const actionCounters = { ...INITIAL_ACTION_COUNTERS };

  for (let i = 0; i < payloads.length; i++) {
    const element = payloads[i];
    const action = element?.action?.toLowerCase();

    if (!isValidAction(action)) {
      logError({
        message: `Invalid action: ${action}`,
        meta: { flowId, action, index: i },
      });
      continue;
    }

    const domain = element?.jsonRequest?.context?.domain;

    try {
      const result = await checkPayload(
        domain,
        element,
        action,
        sessionID,
        flowId,
        domainConfig
      );

      messages[`${action}_${actionCounters[action]}`] = JSON.stringify(result);
      actionCounters[action] += 1;
    } catch (error) {
      logError({
        message: `Error occurred for action ${action} at index ${i}`,
        error,
        meta: { flowId, action, index: i },
      });
    }
  }

  return messages;
}

// Main validation module function
export async function validationModule(
  groupedPayloads: Record<string, Payload[]>,
  sessionID: string
): Promise<Report> {
  logInfo({
    message: MESSAGES.services.validationEnter,
    meta: { sessionID, flowCount: Object.keys(groupedPayloads).length },
  });

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
    logInfo({
      message: MESSAGES.validations.checkingMandatoryFlows,
      meta: { testedFlows },
    });
    
    checkMandatoryFlows(testedFlows, domainConfig, report);
    
    logInfo({
      message: MESSAGES.validations.mandatoryFlowsDone,
      meta: { testedFlows },
    });
  } catch (error: any) {
    logError({
      message: "Error checking mandatory flows",
      error,
      meta: { testedFlows },
    });
  }
  // Process each flow
  for (const flowId in groupedPayloads) {
    const requiredSequence = domainConfig?.flows?.[flowId];
    const payloads = groupedPayloads[flowId];

    logInfo({
      message: MESSAGES.validations.actionValidationStart(flowId),
      meta: { flowId },
    });

    // Step 1: Validate action sequence
    const { validSequence, errors } = validateActionSequence(payloads, requiredSequence || []);

    logInfo({
      message: MESSAGES.validations.actionValidationDone(flowId),
      meta: { flowId },
    });

    // Step 2: Process payloads
    const messages = await processPayloads(payloads, sessionID, flowId, domainConfig);

    logInfo({
      message: MESSAGES.validations.payloadProcessingDone(flowId),
      meta: { flowId },
    });

    // Step 3: Store validation results
    flowsReport[flowId] = {
      valid_flow: validSequence,
      errors,
      messages,
    };
  }

  report.flowErrors = flowsReport;

  logInfo({
    message: MESSAGES.services.validationExit,
    meta: { sessionID, flowCount: Object.keys(flowsReport).length },
  });

  return report;
}
