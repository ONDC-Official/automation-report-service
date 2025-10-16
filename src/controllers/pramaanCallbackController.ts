import { Request, Response } from "express";
import axios from "axios";
import logger from "@ondc/automation-logger";

export const pramaanCallbackController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const testId = req.params.testId;
    const base64Data = req.body.data;

    logger.info(`Received callback for testId: ${testId}`);

    if (!base64Data) {
      logger.error(`Missing data in callback for testId: ${testId}`);
      res.status(400).json({ error: "Missing data in callback" });
      return;
    }

    const automationDbUrl = process.env.DATA_BASE_URL;
    if (!automationDbUrl) {
      throw new Error("DATA_BASE_URL not defined in environment variables");
    }

    const reportUrl = `${automationDbUrl}/report/${testId}`;
    logger.info(`Forwarding report callback to ${reportUrl}`);

    // Post report data to your automation DB
    const response = await axios.post(
      reportUrl,
      { data: base64Data },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.API_SERVICE_KEY,
        },
      }
    );

    logger.info(
      `Successfully forwarded report for testId ${testId} — DB responded with status ${response.status}`
    );

    res.status(200).json({ message: "Report forwarded successfully" });
  } catch (err: any) {
    logger.error(
      `Error forwarding callback for testId: ${req.params.testId}`,
      err
    );
    res.status(500).json({ error: err.message });
  }
};
