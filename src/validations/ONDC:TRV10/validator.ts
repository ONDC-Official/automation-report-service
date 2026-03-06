import { Payload, TestResult } from "../../types/payload";
import { createDomainValidator } from "../shared/baseValidator";
import { ackResponseSchema, ackOnlySchema } from "../shared/responseSchemas";
import { checkJsonResponse } from "../shared/schemaValidator";

const resolveVersion = (element: Payload) =>
  element?.jsonRequest?.context?.version || element?.jsonRequest?.context?.core_version;

// Action IDs that return an error-shape sync response (no ACK message object).
// NOTE: element.action_id is populated from step.actionId in the backend state,
// which stores the BASE action name (e.g. "on_confirm"), not the numbered variant
// (e.g. "on_confirm_1"). So flowId is the more reliable discriminator.
const ERROR_RESPONSE_ACTION_IDS = new Set([
  "on_confirm_driver_not_found",
  "on_confirm_1",
  "on_confirm", // base action name fallback (backend may return this instead of on_confirm_1)
]);

// Entire flows where sync responses may not have a standard ACK message object.
// flowId is always reliably set and is the primary discriminator.
const ERROR_RESPONSE_FLOWS = new Set([
  "OnDemand_Ride_Technical_Cancellation_Flow",
]);

const checkJsonResponseWithSchema = (
  jsonResponse: any,
  testResults: TestResult,
  action_id?: string,
  flowId?: string
) => {
  // Use ackOnlySchema (message optional) when:
  // 1. The flow is a known error-response flow (primary — flowId is reliable), OR
  // 2. The action_id matches a known error-response action (fallback)
  const isErrorScenario =
    (flowId !== undefined && ERROR_RESPONSE_FLOWS.has(flowId)) ||
    (action_id !== undefined && ERROR_RESPONSE_ACTION_IDS.has(action_id));

  const schema = isErrorScenario ? ackOnlySchema : ackResponseSchema;
  checkJsonResponse(jsonResponse, testResults, schema);
};

export const validate = createDomainValidator(resolveVersion, checkJsonResponseWithSchema);
