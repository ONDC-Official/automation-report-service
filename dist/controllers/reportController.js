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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReportController = generateReportController;
const dbService_1 = require("../services/dbService"); // Importing the service to fetch payloads from the database
const utilityService_1 = require("../services/utilityService"); // Importing the service for generating utility report
const groupUtils_1 = require("../utils/groupUtils"); // Importing a utility to group and sort payloads based on Flow ID
const validationModule_1 = require("../services/validationModule"); // Importing the validation module to perform validation on the data
const generateReport_1 = require("../templates/generateReport"); // Importing a function to generate an HTML report
const logger_1 = require("../utils/logger"); // Assuming you have a logger utility for logging info and errors
// The main controller function that generates a report
function generateReportController(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Retrieve sessionId from query parameters
            const sessionId = req.query.sessionId;
            // Log the received sessionId
            logger_1.logger.info(`Received sessionId: ${sessionId}`);
            // If sessionId is missing, send a 400 response with an error message
            if (!sessionId) {
                logger_1.logger.error("Missing sessionId parameter");
                res.status(400).send("Missing sessionId parameter");
                return;
            }
            // Fetch payloads from the database based on the sessionId
            logger_1.logger.info("Fetching payloads from the database...");
            const payloads = yield (0, dbService_1.fetchPayloads)(sessionId);
            logger_1.logger.info(`Fetched ${payloads.length} payloads from the database`);
            // Group and sort the fetched payloads by Flow ID
            logger_1.logger.info("Grouping and sorting payloads by Flow ID...");
            const flows = (0, groupUtils_1.groupAndSortPayloadsByFlowId)(payloads);
            logger_1.logger.info(`Grouped and sorted ${flows.length} flows`);
            // If the environment variable 'UTILITY' is set to "true", generate a utility report
            if (process.env.UTILITY === "true") {
                logger_1.logger.info("Generating utility report...");
                const htmlReport = yield (0, utilityService_1.utilityReport)(flows); // Generate the utility HTML report
                res.status(200).send(htmlReport); // Send the generated report as the response
                logger_1.logger.info("Utility report generated and sent.");
                return;
            }
            // If the 'UTILITY' environment variable is not "true", proceed with the validation module
            logger_1.logger.info("Running validation module...");
            const result = yield (0, validationModule_1.validationModule)(flows, sessionId); // Perform validation on the grouped payloads
            logger_1.logger.info("Validation module completed.");
            // Generate a custom HTML report based on the validation result
            logger_1.logger.info("Generating custom HTML report...");
            const htmlReport = (0, generateReport_1.generateCustomHTMLReport)(result);
            // Send the generated HTML report as the response
            res.status(200).send(htmlReport);
            logger_1.logger.info("Custom HTML report generated and sent.");
        }
        catch (error) {
            // Log any error that occurs during report generation
            logger_1.logger.error("Error generating report:", error);
            // Send a 500 response if an error occurs
            res.status(500).send("Failed to generate report");
        }
    });
}
