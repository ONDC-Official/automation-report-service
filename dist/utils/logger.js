"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = require("winston");
const { combine, timestamp, printf, colorize } = winston_1.format;
// Custom log format
const customFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
});
// Create a logger instance
exports.logger = (0, winston_1.createLogger)({
    level: 'info', // Default log level
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), colorize(), // Adds color to log levels (e.g., error in red, info in green)
    customFormat),
    transports: [
        new winston_1.transports.Console(), // Log to the console
        new winston_1.transports.File({ filename: 'logs/application.log' }), // Log to a file
    ],
});
// Example usage:
// logger.info('This is an info message');
// logger.error('This is an error message');
