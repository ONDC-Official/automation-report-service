import { TestResult } from "../../types/payload";
import { Validation } from "./contextValidator";
import Joi from "joi";

// Default ACK/NACK schema (used when a schema isn't provided)
const defaultAckSchema = Joi.object({
    context: Joi.object({
      domain: Joi.string().required(),
      country: Joi.string().required(),
      city: Joi.string().required(),
      action: Joi.string().required(),
      core_version: Joi.string().required(),
      bap_id: Joi.string().required(),
      bap_uri: Joi.string().uri().required(),
      transaction_id: Joi.string().required(),
      message_id: Joi.string().required(),
      timestamp: Joi.string().isoDate().required(),
      bpp_id: Joi.string(),
      bpp_uri: Joi.string().uri(),
      ttl: Joi.string(),
    }).required(),

    message: Joi.object({
      ack: Joi.object({
        status: Joi.string().valid("ACK", "NACK").required(),
      }).required(),
    }).required(),
    
    error: Joi.when(Joi.ref("message.ack.status"), {
      is: "NACK",
      then: Joi.object({
        code: Joi.string().required(),
        message: Joi.string().required(),
      }).required(),
      otherwise: Joi.forbidden(),
    }),
});

export const validateJsonResponse = (
  jsonResponse: any,
  schema?: Joi.ObjectSchema<any>
) => {
  const effectiveSchema = schema ?? defaultAckSchema;
  const { error } = effectiveSchema.validate(jsonResponse, { abortEarly: false });

  return {
    isValid: !error,
    errors: error ? error.details.map((err) => err.message) : [],
  };
};

export const checkJsonResponse = (
  jsonResponse: any,
  testResults: TestResult,
  schema?: Joi.ObjectSchema<any>
) => {
  const { isValid, errors } = validateJsonResponse(jsonResponse?.response, schema);
  if (!isValid) testResults.failed.push(`Issue with sync response: ${errors.join(", ")}`);
};

export async function runValidations(validations: Validation[], payload: unknown) {
  const errors: string[] = [];
  for (const v of validations) {
    const res = await v.run(payload);
    if (!res.ok) {
      errors.push(...res.errors.map(e => `${v.name}: ${e}`));
    }
  }
  return { ok: errors.length === 0, errors };
}


