"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkJsonResponse = exports.validateJsonResponse = void 0;
const joi_1 = __importDefault(require("joi"));
/**
 * Validate the structure of the JSON response using Joi.
 * @param jsonResponse - The JSON response to validate.
 * @returns An object with `isValid` and `errors` properties.
 */
const validateJsonResponse = (jsonResponse) => {
    const schema = joi_1.default.object({
        message: joi_1.default.object({
            ack: joi_1.default.object({
                status: joi_1.default.string().required(),
            }).required(),
        }).required(),
        error: joi_1.default.when("message.ack.status", {
            is: "NACK",
            then: joi_1.default.object({
                code: joi_1.default.string().required(),
                message: joi_1.default.string().required(),
            }).required(),
            otherwise: joi_1.default.forbidden(),
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
exports.validateJsonResponse = validateJsonResponse;
const checkJsonResponse = (jsonResponse, testResults) => {
    const { isValid, errors } = (0, exports.validateJsonResponse)(jsonResponse === null || jsonResponse === void 0 ? void 0 : jsonResponse.response);
    !isValid &&
        testResults.failed.push(`Issue with sync response: ${errors.join(", ")}`);
};
exports.checkJsonResponse = checkJsonResponse;
