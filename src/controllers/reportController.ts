import { Request, Response } from "express";
import axios from "axios";
import { logger } from "../utils/logger";
import { fetchSessionDetails } from "../services/dbService";
import { generateTestsFromPayloads } from "../utils/payloadUtils";

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
    const testId = `PW_${sessionDetails.sessionId}`;
    const { tests, subscriber_id } = await generateTestsFromPayloads(sessionDetails);

    logger.info(`Fetched session details and generated testId: ${testId}`);

    // Build request body for Pramaan
    const body = {
      id: subscriber_id,
      version: sessionDetails.version,
      domain: sessionDetails.domain,
      environment: process.env.PRAMAAN_ENVIRONMENT || "Preprod",
      type: "BUS",
      tests,
      test_id: testId,
    };

    const pramaanUrl = process.env.PRAAMAN_URL;
    if (!pramaanUrl) {
      throw new Error("PRAAMAN_URL is not defined in environment variables");
    }

    logger.info(`Sending sync request to Pramaan at ${pramaanUrl}`);
    const pramaanResponse = await axios.post(pramaanUrl, body, {
      headers: { "Content-Type": "application/json" },
    });

    logger.info(`Received response from Pramaan: ${JSON.stringify(pramaanResponse.data)}`);

    // Extract ack status safely
    const ackStatus = pramaanResponse.data?.message?.ack?.status;

    if (ackStatus === "NACK") {
      logger.warn(`Pramaan responded with NACK for testId: ${testId}`);
      res.status(500).json({
        error: "Pramaan responded with NACK",
        response: pramaanResponse.data,
      });
      return
    }

    if (ackStatus === "ACK") {
      logger.info(`Pramaan responded with ACK for testId: ${testId}`);
      res.status(200).json(pramaanResponse.data);
      return
    }

    // Unexpected structure
    logger.error(`Unexpected Pramaan response format for testId: ${testId}`);
    res.status(500).json({
      error: "Unexpected response format from Pramaan",
      response: pramaanResponse.data,
    });
  } catch (err: any) {
    logger.error("Error in generateReportController:", err);
    res.status(500).json({ error: err.message });
  }
}
