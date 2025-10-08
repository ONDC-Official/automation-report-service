import { Request, Response } from "express";
import { logInfo } from "../utils/logger";
import { MESSAGES } from "../utils/messages";
import { ReportService } from "../services/reportService";
import { apiResponse } from "../utils/responseHandler";

// The main controller function that generates a report
export async function generateReportController(req: Request, res: Response) {
  try {
    logInfo({
      message: MESSAGES.report.enteringController,
      meta: {
        sessionId: req.query.sessionId as string,
      },
    });
    // Retrieve sessionId from query parameters
    const sessionId = req.query.sessionId as string;
    const flowIdToPayloadIdsMap = req?.body as Record<string, string[]>;

    // Log the received sessionId
    // logger.info(`Received sessionId: ${sessionId}`);

    // If sessionId is missing, send a 400 response with an error message
    if (!sessionId) {
      // logger.error("Missing sessionId parameter");
      logInfo({
        message: MESSAGES.report.missingSessionId
      });
      apiResponse.badRequest(res, MESSAGES.responses.missingSessionId);
      return;
    }

    const htmlReport = await new ReportService().generate(sessionId, flowIdToPayloadIdsMap);
    apiResponse.successHTML(res, htmlReport);
    logInfo({
      message: MESSAGES.report.reportSent,
      meta: {
        sessionId,
      },
    });
  } catch (error) {
    // Log any error that occurs during report generation
    // logger.error("Error generating report:", error);
    logInfo({
      message: MESSAGES.report.errorGenerating,
      error: error,
    });
    // console.trace(error);
    // Send a 500 response if an error occurs
    apiResponse.internalError(res, MESSAGES.responses.failedToGenerateReport, error);
  }
}
