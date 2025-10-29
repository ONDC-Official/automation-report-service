import { TestResult,Validation } from "../../types/payload";
import Joi from "joi";

// Default ACK/NACK schema (used when a schema isn't provided)
const defaultAckSchema = Joi.object({
  context: Joi.object({
    domain: Joi.string()
      .pattern(/^ONDC:[A-Z0-9]+$/)
      .required()
      .messages({
        'string.pattern.base': 'domain must start with "ONDC:" followed by uppercase letters/numbers',
      }),

    country: Joi.string()
      .valid('IND')
      .required(),

    city: Joi.string()
      .pattern(/^std:\d+$/)
      .required()
      .messages({
        'string.pattern.base': 'city must be in format std:<city_code> (e.g., std:080)',
      }),

    action: Joi.string()
      .valid('search', 'select', 'init', 'confirm', 'status', 'track', 'cancel', 'update', 'rating', 'support', 'on_search', 'on_select', 'on_init', 'on_confirm', 'on_status', 'on_track', 'on_cancel', 'on_update', 'on_rating', 'on_support')
      .required(),

    core_version: Joi.string()
      .pattern(/^\d+\.\d+\.\d+$/)
      .required()
      .messages({
        'string.pattern.base': 'core_version must be in semver format (e.g., 1.2.5)',
      }),

    bap_id: Joi.string()
      .domain()
      .required()
      .messages({
        'string.domain': 'bap_id must be a valid domain',
      }),

    bap_uri: Joi.string()
      .uri()
      .required(),

    message_id: Joi.string()
      .uuid()
      .required(),

    timestamp: Joi.string()
      .isoDate()
      .required(),

    transaction_id: Joi.string()
      .uuid()
      .required(),

    ttl: Joi.string()
      .pattern(/^PT\d+S$/)
      .required()
      .messages({
        'string.pattern.base': 'ttl must be in ISO 8601 duration format like PT30S',
      }),
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
  const candidate = typeof jsonResponse === "object" && jsonResponse !== null && "response" in jsonResponse
    ? (jsonResponse as any).response
    : jsonResponse;
  const { isValid, errors } = validateJsonResponse(candidate, schema);
  if (!isValid) testResults.failed.push(`Issue with sync response: ${errors.join(", ")}`);
};

export async function runValidations(validations: Validation[], payload: unknown) {
  const errors: string[] = [];
  for (const v of validations) {
    const res = await v.run(payload);
    // Support both legacy/new shapes from validators:
    // 1) { ok: boolean, errors: string[] }
    // 2) { valid: boolean, results: { valid:boolean, description:string }[] }
    let ok: boolean | undefined;
    let errs: string[] | undefined;

    if (res && typeof res === 'object') {
      if ('ok' in res && 'errors' in res) {
        ok = (res as any).ok as boolean;
        const rErrors = (res as any).errors;
        errs = Array.isArray(rErrors) ? rErrors.map(String) : rErrors != null ? [String(rErrors)] : [];
      } else if ('valid' in res && 'results' in res) {
        ok = (res as any).valid as boolean;
        const results = (res as any).results ?? [];
        errs = Array.isArray(results)
          ? results.filter((r: any) => r && r.valid === false).map((r: any) => String(r.description ?? 'Invalid'))
          : [];
      }
    }

    if (ok === undefined || errs === undefined) {
      errors.push(`${v.name}: Validation result missing required properties`);
      continue;
    }

    if (!ok) {
      errors.push(...errs.map((e: string) => `${v.name}: ${e}`));
    }
  }
  return { ok: errors.length === 0, errors };
}


