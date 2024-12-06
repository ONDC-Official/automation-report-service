require('dotenv').config();

export const STORAGE_URL = process.env.STORAGE_URL || "http://13.233.69.163:8080/payload";
export const VALIDATION_URL = process.env.VALIDATION_URL || "https://log-validation.ondc.org/api/validate/trv";


