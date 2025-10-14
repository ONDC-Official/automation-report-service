import { Request, Response } from "express";
import axios from "axios";
import { logger } from "../utils/logger";
import { fetchSessionDetails } from "../services/dbService";
import { generateTestsFromPayloads, getNetworkParticipantId } from "../utils/payloadUtils";
import { reportEmitter } from "../utils/eventEmitter";

export async function generateReportController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      logger.error("Missing sessionId parameter");
      res.status(400).send("Missing sessionId parameter");
      return;
    }
    logger.info(`Received generate report request for sessionId: ${sessionId}`);

    // Fetch session details
    const sessionDetails = await fetchSessionDetails(sessionId);
    const subscriberId = getNetworkParticipantId(sessionDetails);
    const testId = `PW_${sessionDetails.sessionId}`;
    const tests = generateTestsFromPayloads(sessionDetails);

    logger.info(`Fetched session details and generated testId: ${testId}`);

    // Build request body
    const body = {
      id: subscriberId,
      version: sessionDetails.version,
      domain: sessionDetails.domain,
      environment: process.env.PRAMAAN_ENVIRONMENT || "Preprod",
      type: "BUS",
      tests,
      test_id: testId,
    };

    const pramaanUrl = process.env.PRAAMAN_URL;
    if (!pramaanUrl) {
      logger.error("PRAAMAN_URL is not defined in environment variables");
      throw new Error("PRAAMAN_URL is not defined in environment variables");
    }

    logger.info(`Sending sync request to Pramaan at ${pramaanUrl}`);
    const pramaanResponse = await axios.post(pramaanUrl, body, {
      headers: { "Content-Type": "application/json" },
    });
    logger.info(`Received sync response from Pramaan: ${JSON.stringify(pramaanResponse.data)}`);

    if (pramaanResponse.data.status === "NACK") {
      logger.warn(`Pramaan responded with NACK for testId: ${testId}`);
      res.status(500).send(pramaanResponse.data);
      return;
    }

    logger.info(`Waiting for async report callback for testId: ${testId}`);

    // Wait for async report using EventEmitter
    const reportData: Buffer = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reportEmitter.removeAllListeners(testId);
        logger.error(`Timeout waiting for async report for testId: ${testId}`);
        reject(new Error("Timeout waiting for async report"));
      }, 60000); // 60s timeout

      reportEmitter.once(
        testId,
        (data: { base64Data?: string; error?: string }) => {
          clearTimeout(timeout);
          if (data.error) {
            logger.error(`Error in async report callback for testId ${testId}: ${data.error}`);
            return reject(new Error(data.error));
          }
          if (data.base64Data) {
            logger.info(`Received async report for testId: ${testId}`);
            resolve(Buffer.from(data.base64Data, "base64"));
          } else {
            logger.error(`Invalid data received in async callback for testId: ${testId}`);
            reject(new Error("Invalid data from callback"));
          }
        }
      );
    });

    // Send as HTML file download
    logger.info(`Sending HTML report for testId: ${testId}`);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=report_${testId}.html`
    );
    res.setHeader("Content-Type", "text/html");
    res.send(reportData.toString("utf-8")); // convert Buffer to string
  } catch (err: any) {
    logger.error("Error in generateReportController:", err);
    res.status(500).send({ error: err.message });
  }
}