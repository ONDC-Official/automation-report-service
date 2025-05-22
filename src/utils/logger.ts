import winston from "winston";
import chalk from "chalk";
import LokiTransport from "winston-loki";
import { LogParams } from "../types/log-params";
import { isAxiosError } from "axios";


const { combine, timestamp, printf, errors } = winston.format;

// Define colors for log levels and messages
const levelColors: Record<string, chalk.Chalk> = {
	error: chalk.bold.red, // Bright red for errors
	warn: chalk.hex("#FFA500"), // Orange for warnings
	info: chalk.blue, // Blue for information
	debug: chalk.green, // Green for debugging
	default: chalk.white, // Default color for others
};

const messageColors: Record<string, chalk.Chalk> = {
	error: chalk.redBright, // Highlight error messages
	warn: chalk.yellowBright, // Bright yellow for warnings
	info: chalk.cyan, // Cyan for information messages
	debug: chalk.magentaBright, // Bright magenta for debugging
	default: chalk.gray, // Default gray for fallback
};

const environment = process.env.NODE_ENV || "development"; // Default to development if not set

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, transaction_id , ...meta}) => {
	const levelColor = levelColors[level] || levelColors.default; // Colorize level
	const messageColor = messageColors[level] || messageColors.default; // Colorize message

	const coloredLevel = levelColor(`[${level.toUpperCase()}]`); // Apply color to log level
	const coloredTimestamp = chalk.dim(timestamp); // Dim timestamp
	const coloredMessage = messageColor(message); // Apply message-specific color
	const coloredStack = stack ? chalk.dim(stack) : ""; // Dim stack trace if present
	const coloredtransaction_id = transaction_id ? chalk.yellow(`[${transaction_id}] `) : ""; // Yellow for transaction ID
	const coloredMeta = meta && Object.keys(meta).length > 0 ? chalk.gray(JSON.stringify(meta)) : "";
	const printable = environment === "prod" ? `${coloredtransaction_id}${coloredLevel}: ${coloredMessage} ${coloredStack}` : `${coloredTimestamp} ${coloredtransaction_id}${coloredLevel}: ${coloredMessage} ${coloredStack} ${coloredMeta}`;
	return printable;
});

// Determine log level based on environment
const logLevel = process.env.NODE_ENV === "production" ? "info" : "debug";

// Configure Winston logger
const logger = winston.createLogger({
	level: logLevel,
	format: combine(
		timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
		errors({ stack: true }), // Include stack trace in error messages
		logFormat
	),
	transports: [
		// Console transport with colorized output
		new winston.transports.Console(),

		// Loki transport for sending logs to Grafana Loki
		// new LokiTransport({
		// 	host: process.env.LOKI_HOST || "http://localhost:3100", // Loki endpoint
		// 	labels: {
		// 		app: process.env.APP_NAME || "automation", // Custom label for filtering in Loki
		// 		env: process.env.NODE_ENV || "development",
		// 	},
		// 	json: true, // Send logs in JSON format
		// 	onConnectionError: (err) => console.error("Loki connection error:", err), // Handle connection errors
		// }),
	],
});



// Logging functions
const logInfo = ({ message, transaction_id, meta }: LogParams): void => {
	logger.info(message, { transaction_id, ...meta });
  };
  
  const logDebug = ({ message, transaction_id, meta }: LogParams): void => {
	logger.debug(message, { transaction_id, ...meta });
  };
  
  const logError = ({ message, transaction_id, error, meta }: LogParams): void => {
	if(isAxiosError(error)) {

		message = error.response ? error.response?.data : error.code;
	  logger.error(`Axios Error : Status Code [${error.status}] : `+ JSON.stringify(message) , { transaction_id, ...meta });
	return;
	}
	  if (error instanceof Error) {
	  logger.error(message, { transaction_id, stack: error.stack, ...meta });
	} else {
	  logger.error(message, { transaction_id, ...meta });
	}
  };
  

export { logger, logInfo, logDebug, logError };