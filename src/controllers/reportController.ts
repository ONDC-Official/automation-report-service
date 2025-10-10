import { Request, Response } from "express";
import { fetchPayloads, fetchSessionDetails } from "../services/dbService"; // Importing the service to fetch payloads from the database
import { utilityReport } from "../services/utilityService"; // Importing the service for generating utility report
import { sortPayloadsByCreatedAt } from "../utils/groupUtils"; // Importing a utility to group and sort payloads based on Flow ID
import { validationModule } from "../services/validationModule"; // Importing the validation module to perform validation on the data
import { generateCustomHTMLReport } from "../templates/generateReport"; // Importing a function to generate an HTML report
import { logger, logInfo } from "../utils/logger"; // Assuming you have a logger utility for logging info and errors
import { RedisService } from "ondc-automation-cache-lib";
import { ENABLED_DOMAINS } from "../utils/constants";
import axios from "axios";
import {
  generateTestsFromPayloads,
  getNetworkParticipantId,
} from "../utils/payloadUtils";

// The main controller function that generates a report
export async function generateReportController(req: Request, res: Response) {
  try {
    // Retrieve sessionId from query parameters
    const sessionId = req.query.sessionId as string;
    const flowIdToPayloadIdsMap = (req?.body as Record<string, string[]>) || "";

    // Log the received sessionId
    // logger.info(`Received sessionId: ${sessionId}`);

    // If sessionId is missing, send a 400 response with an error message
    if (!sessionId) {
      // logger.error("Missing sessionId parameter");
      res.status(400).send("Missing sessionId parameter");
      return;
    }
    //Save session details in Reporting Cache
    const sessionDetails = await fetchSessionDetails(sessionId);
    await RedisService.setKey(
      `sessionDetails:${sessionId}`,
      JSON.stringify(sessionDetails)
    );
    const sessionDataJson = JSON.parse(
      (await RedisService.getKey(sessionId)) || "{}"
    );

    const subscriberId = getNetworkParticipantId(sessionDetails);
    const testId = `PW_${sessionDetails.sessionId}`;
    const tests = generateTestsFromPayloads(sessionDetails);
    const body = {
      id: subscriberId,
      version: sessionDetails.version,
      domain: sessionDetails.domain,
      environment: process.env.PRAMAAN_ENVIRONMENT || "Preprod",
      type: sessionDataJson.usecaseId?.toUpperCase() || "BUS",
      tests: tests,
      test_id: testId
    };
    console.log("The body is ", body);
    const pramaanUrl = process.env.PRAAMAN_URL;
    if (!pramaanUrl) {
      throw new Error("PRAAMAN_URL is not defined in environment variables");
    }
    try {
      const pramaanResponse = await axios.post(pramaanUrl, body, {
        headers: { "Content-Type": "application/json" },
      });
      console.log("Successfully sent data to Pramaan:", pramaanResponse.status);
      res.status(200).send(pramaanResponse.data);
      return;
    } catch (err: any) {
      res.status(500).send(err.response.data.message);
      console.error("Error sending data to Pramaan:", err.response.data.message);
      return;
    }

    // Fetch payloads from the database based on the sessionId
    // logger.info("Fetching payloads from the database...");
    const payloads = await fetchPayloads(flowIdToPayloadIdsMap);

    // Group and sort the fetched payloads by Flow ID
    // logger.info("sorting payloads by Flow ID...");
    const flows = sortPayloadsByCreatedAt(payloads);

    // If the environment variable 'UTILITY' is set to "true", generate a utility report
    if (!ENABLED_DOMAINS.includes(sessionDetails?.domain)) {
      // logger.info("Generating utility report...");
      const htmlReport = await utilityReport(flows, sessionId); // Generate the utility HTML report
      res.status(200).send(htmlReport); // Send the generated report as the response
      //FWD logger.info("Utility report generated and sent.");
      logInfo({
        message:
          "Exiting generateReportController function. Utility report generated and sent.",
        meta: {
          sessionId,
        },
      });
      return;
    }

    // If the 'UTILITY' environment variable is not "true", proceed with the validation module
    // logger.info("Running validation module...");
    const result = await validationModule(flows, sessionId); // Perform validation on the grouped payloads
    //FWD logger.info("Validation module completed.");

    // Generate a custom HTML report based on the validation result
    //FWD logger.info("Generating custom HTML report...");
    const htmlReport = generateCustomHTMLReport(result);

    // Send the generated HTML report as the response
    res.status(200).send(htmlReport);
    // logger.info("Custom HTML report generated and sent.");
    logInfo({
      message:
        "Exiting generateReportController function. Custom HTML report generated and sent.",
      meta: {
        sessionId,
      },
    });
  } catch (error) {
    // Log any error that occurs during report generation
    // logger.error("Error generating report:", error);
    logInfo({
      message: "Error generating report",
      error: error,
    });
    // console.trace(error);
    // Send a 500 response if an error occurs
    console.log(error);
    res.status(500).send("Failed to generate report myerror");
  }
}
