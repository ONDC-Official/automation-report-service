import { TestResult } from "../../types/payload";
import Joi from "joi";

/**
 * Validate the structure of the JSON response using Joi.
 * @param jsonResponse - The JSON response to validate.
 * @returns An object with `isValid` and `errors` properties.
 */
export const validateJsonResponse = (jsonResponse: any) => {
  const schema = Joi.object({
    message: Joi.object({
      ack: Joi.object({
        status: Joi.string().required(),
      }).required(),
    }).required(),
    error: Joi.when("message.ack.status", {
      is: "NACK",
      then: Joi.object({
        code: Joi.string().required(),
        message: Joi.string().required(),
      }).required(),
      otherwise: Joi.forbidden(),
    }),
  });

  const { error } = schema.validate(jsonResponse, { abortEarly: false });

  return {
    isValid: !error,
    errors: error
      ? error.details.map((err) => err.message)
      : [],
  };
};

export const checkJsonResponse = (
  jsonResponse: any,
  testResults: TestResult
) => {
  const { isValid, errors } = validateJsonResponse(jsonResponse?.response);

  !isValid &&
    testResults.failed.push(
      `Issue with sync response: ${errors.join(", ")}`
    );
};