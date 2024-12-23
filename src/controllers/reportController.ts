import { Request, Response } from "express";
import { fetchPayloads } from "../services/dbService";  // Importing the service to fetch payloads from the database
import { utilityReport } from "../services/utilityService";  // Importing the service for generating utility report
import { groupAndSortPayloadsByFlowId } from "../utils/groupUtils";  // Importing a utility to group and sort payloads based on Flow ID
import { validationModule } from "../services/validationModule";  // Importing the validation module to perform validation on the data
import { generateCustomHTMLReport } from "../templates/generateReport";  // Importing a function to generate an HTML report
import {logger} from "../utils/logger";  // Assuming you have a logger utility for logging info and errors

// The main controller function that generates a report
export async function generateReportController(req: Request, res: Response) {
  try {
    // Retrieve sessionId from query parameters
    const sessionId = req.query.sessionId as string;

    // Log the received sessionId
    logger.info(`Received sessionId: ${sessionId}`);

    // If sessionId is missing, send a 400 response with an error message
    if (!sessionId) {
      logger.error("Missing sessionId parameter");
      res.status(400).send("Missing sessionId parameter");
      return;
    }

    // Fetch payloads from the database based on the sessionId
    logger.info("Fetching payloads from the database...");
    const payloads = await fetchPayloads(sessionId);
    logger.info(`Fetched ${payloads.length} payloads from the database`);

    // Group and sort the fetched payloads by Flow ID
    logger.info("Grouping and sorting payloads by Flow ID...");
    const flows = groupAndSortPayloadsByFlowId(payloads);
    logger.info(`Grouped and sorted ${flows.length} flows`);

    // If the environment variable 'UTILITY' is set to "true", generate a utility report
    if (process.env.UTILITY === "true") {
      logger.info("Generating utility report...");
      const htmlReport = await utilityReport(flows);  // Generate the utility HTML report
      res.status(200).send(htmlReport);  // Send the generated report as the response
      logger.info("Utility report generated and sent.");
      return;
    }

    // If the 'UTILITY' environment variable is not "true", proceed with the validation module
    logger.info("Running validation module...");
    const result = await validationModule(flows, sessionId);  // Perform validation on the grouped payloads
    logger.info("Validation module completed.");

    // Generate a custom HTML report based on the validation result
    logger.info("Generating custom HTML report...");
    const htmlReport = generateCustomHTMLReport(result);

    // Send the generated HTML report as the response
    res.status(200).send(htmlReport);
    logger.info("Custom HTML report generated and sent.");
  } catch (error) {
    // Log any error that occurs during report generation
    logger.error("Error generating report:", error);

    // Send a 500 response if an error occurs
    res.status(500).send("Failed to generate report");
  }
}