import { Request, Response } from "express";
import axios from "axios";
import logger from "@ondc/automation-logger";
import { CacheService } from "../services/cacheService";

export const pramaanCallbackController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const rawTestId = req.params.testId;

    const [testId, userId] = rawTestId.includes("::")
      ? rawTestId.split("::")
      : [rawTestId, undefined];

    const { data: base64Data, flow_summary: inlineFlowSummary } = req.body;

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

    // Prefer flow_summary sent inline in the callback body (Pramaan buyer path).
    // Fall back to the one cached in Redis by checkPramaanReport (frontend-triggered path).
    let flow_summary = inlineFlowSummary;
    if (!flow_summary) {
      const cached = await CacheService.get(`flow_summary:${rawTestId}`);
      if (cached) {
        try {
          flow_summary = JSON.parse(cached);
          logger.info(`Retrieved flow_summary from cache for testId: ${rawTestId}`);
        } catch {
          logger.error(`Failed to parse cached flow_summary for testId: ${rawTestId}`);
        }
        // Clean up after reading
        CacheService.set(`flow_summary:${rawTestId}`, "").catch(() => { });
      }
    }

    const reportUrl = `${automationDbUrl}/report/${testId}`;
    logger.info("flow_summary=>>>", flow_summary);
    const response = await axios.post(
      reportUrl,
      {
        data: base64Data,
        ...(flow_summary && { flow_summary }),
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.API_SERVICE_KEY,
        },
        params: {
          ...(userId && { userId }),
        },
      }
    );

    logger.info(
      `Successfully forwarded report for testId ${testId} — DB responded with status ${response.status}`,
    );

    res.status(200).json({ message: "Report forwarded successfully" });
  } catch (err: any) {
    logger.error(
      `Error forwarding callback for testId: ${req.params.testId}`,
      err,
    );
    res.status(500).json({ error: err.message });
  }
};
