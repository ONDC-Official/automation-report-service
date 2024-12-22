import { Request, Response } from "express";
import { fetchPayloads } from "../services/dbService";  // Importing the service to fetch payloads from the database
import { utilityReport } from "../services/utilityService";  // Importing the service for generating utility report
import { groupAndSortPayloadsByFlowId } from "../utils/groupUtils";  // Importing a utility to group and sort payloads based on Flow ID
import { validationModule } from "../services/validationModule";  // Importing the validation module to perform validation on the data
import { generateCustomHTMLReport } from "../templates/generateReport";  // Importing a function to generate an HTML report

// The main controller function that generates a report
export async function generateReportController(req: Request, res: Response) {
  try {
    // Retrieve sessionId from query parameters
    const sessionId = req.query.sessionId as string;

    // If sessionId is missing, send a 400 response with an error message
    if (!sessionId) {
      res.status(400).send("Missing sessionId parameter");
      return;
    }

    // Fetch payloads from the database based on the sessionId
    const payloads = await fetchPayloads(sessionId);
    
    // Group and sort the fetched payloads by Flow ID
    const flows = groupAndSortPayloadsByFlowId(payloads);

    // If the environment variable 'UTILITY' is set to "true", generate a utility report
    if (process.env.UTILITY === "true") {
      const htmlReport = await utilityReport(flows);  // Generate the utility HTML report
      res.status(200).send(htmlReport);  // Send the generated report as the response
      return;
    }

    // If the 'UTILITY' environment variable is not "true", proceed with the validation module
    const result = await validationModule(flows);  // Perform validation on the grouped payloads

    // Generate a custom HTML report based on the validation result
    const htmlReport = generateCustomHTMLReport(result);
    
    // Send the generated HTML report as the response
    res.status(200).send(htmlReport);
  } catch (error) {
    // Log any error that occurs during report generation
    console.error("Error generating report:", error);

    // Send a 500 response if an error occurs
    res.status(500).send("Failed to generate report");
  }
}