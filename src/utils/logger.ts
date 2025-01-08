import { createLogger, format, transports } from 'winston';
const { combine, timestamp, printf, colorize } = format;
import LokiTransport from "winston-loki";

// Custom log format
const customFormat = printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

// Create a logger instance
export const logger = createLogger({
  level: 'info', // Default log level
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    colorize(), // Adds color to log levels (e.g., error in red, info in green)
    customFormat
  ),
  transports: [
    new transports.Console(), // Log to the console
    new transports.File({ filename: 'logs/application.log' }), // Log to a file
    new LokiTransport({
      host: "http://localhost:3100", // Loki instance URL
      labels: { app: "automation-reporting-service" }, // Custom labels for Loki logs
      json: true, // Send logs in JSON format
      interval: 1, // Flush logs every 1 second
      // replaceTimestamp: true, // Replace timestamps with formatted ones
    }),
  ],
});

// Example usage:
// logger.info('This is an info message');
// logger.error('This is an error message');