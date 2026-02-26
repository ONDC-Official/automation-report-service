import { Payload, TestResult } from "../../types/payload";
import { createDomainValidator } from "../shared/baseValidator";
import { ackResponseSchema, ackOnlySchema } from "../shared/responseSchemas";
import { checkJsonResponse } from "../shared/schemaValidator";

const resolveVersion = (element: Payload) =>
  element?.jsonRequest?.context?.version || element?.jsonRequest?.context?.core_version;

// Action IDs that return an error-shape sync response (no ACK message object).
// For these, use the relaxed ackOnlySchema (message is optional) to avoid false failures.
const ERROR_RESPONSE_ACTION_IDS = new Set([
  "on_confirm_driver_not_found",
  "on_confirm_1",
]);

const checkJsonResponseWithSchema = (
  jsonResponse: any,
  testResults: TestResult,
  action_id?: string,
  flowId?: string
) => {
  const isErrorScenario = action_id !== undefined && ERROR_RESPONSE_ACTION_IDS.has(action_id);
  const schema = isErrorScenario ? ackOnlySchema : ackResponseSchema;
  checkJsonResponse(jsonResponse, testResults, schema);
};

export const validate = createDomainValidator(resolveVersion, checkJsonResponseWithSchema);
