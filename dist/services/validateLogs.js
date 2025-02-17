"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFlows = validateFlows;
exports.validateLogs = validateLogs;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function validateFlows(parsedFlows) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield Promise.all(Object.entries(parsedFlows).map((_a) => __awaiter(this, [_a], void 0, function* ([flowId, parsedPayload]) {
                const results = yield validateLogs(flowId, parsedPayload);
                return { flowId, results };
            })));
        }
        catch (error) {
            console.error("Error occurred while validating flows:", error);
            throw error;
        }
    });
}
function validateLogs(flowId, parsedPayload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const validationUrl = process.env.VALIDATION_URL ||
            "https://log-validation.ondc.org/api/validate/trv";
        try {
            const response = yield axios_1.default.post(validationUrl, parsedPayload);
            // Wrap the successful response in a `ValidationResult`
            return { success: true, response: response.data };
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                const axiosError = error;
                // Capture and return error details
                const statusCode = ((_a = axiosError.response) === null || _a === void 0 ? void 0 : _a.status) || "Unknown status code";
                const errorDetails = ((_b = axiosError.response) === null || _b === void 0 ? void 0 : _b.data) || {
                    message: "No response data",
                };
                return {
                    success: false,
                    error: `Validation failed with status ${statusCode}`,
                    details: errorDetails,
                };
            }
            // Handle unexpected errors
            return {
                success: false,
                error: "Unexpected error during validation",
                details: error.message,
            };
        }
    });
}
