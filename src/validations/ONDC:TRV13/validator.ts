import { Payload, TestResult } from "../../types/payload";
import { createDomainValidator } from "../shared/baseValidator";
import { ackResponseSchema } from "../shared/responseSchemas";
import { checkJsonResponse } from "../shared/schemaValidator";

// Resolve domain version - prioritize 'version' over 'core_version'
const resolveVersion = (element: Payload) =>
  element?.jsonRequest?.context?.version || "2.0.1";

const checkJsonResponseWithSchema = (jsonResponse: any, testResults: TestResult) =>
  checkJsonResponse(jsonResponse, testResults, ackResponseSchema);

export const validate = createDomainValidator(resolveVersion, checkJsonResponseWithSchema);
