import { Request, Response } from "express";
import logger from "@ondc/automation-logger";
import { MESSAGES } from "../utils/messages";
import { ReportService } from "../services/reportService";
import { apiResponse } from "../utils/responseHandler";

export async function generateReportController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      logger.error(MESSAGES.responses.missingSessionId);
      apiResponse.badRequest(res,MESSAGES.responses.missingSessionId);
      return;
    }

    logger.info(`${MESSAGES.report.enteringController} ${sessionId}`);
    const flowIdToPayloadIdsMap = req?.body as Record<string, string[]>;
    const htmlReport = await new ReportService().generate(
      sessionId,
      flowIdToPayloadIdsMap
    );
    console.log("Request Completed")
    apiResponse.successHTML(res, htmlReport);
    logger.info(MESSAGES.report.reportSent, {
      meta: {
        sessionId,
      },
    });
  } catch (err: any) {
    logger.info(MESSAGES.report.errorGenerating, { error: err });
    apiResponse.internalError(
      res,
      MESSAGES.responses.failedToGenerateReport,
      err
    );
  }
}