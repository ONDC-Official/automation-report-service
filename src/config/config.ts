// src/config/config.ts

require('dotenv').config();

export const STORAGE_URL = process.env.STORAGE_URL || "https://api.example.com/payloads";
export const VALIDATION_URL = process.env.VALIDATION_URL || "https://api.example.com/validate";


