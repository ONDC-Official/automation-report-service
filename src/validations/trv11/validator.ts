import { ValidationAction } from "../../types/actions";
import { Payload, TestResult } from "../../types/payload";
import { createDomainValidator } from "../shared/baseValidator";
import { ackOnlySchema } from "../shared/responseSchemas";
import { checkJsonResponse } from "../shared/schemaValidator";

const resolveVersion = (element: Payload) => element?.jsonRequest?.context?.version;

const checkJsonResponseWithSchema = (jsonResponse: any, testResults: TestResult) =>
  checkJsonResponse(jsonResponse, testResults, ackOnlySchema);

export const validate = createDomainValidator(resolveVersion, checkJsonResponseWithSchema);
