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
    const userId = req.query?.user_id as string;
    logger.info("Received request to generate report for sessionId:", { sessionId, userId });
    if (!sessionId) {
      logger.error(MESSAGES.responses.missingSessionId);
      apiResponse.badRequest(res, MESSAGES.responses.missingSessionId);
      return;
    }
    logger.info(`${MESSAGES.report.enteringController} ${sessionId}`);

    // Extract flowIdToPayloadIdsMap and flow_summary from body
    const { flow_summary, ...flowIdToPayloadIdsMap } = req?.body as Record<string, any>;

    const htmlReport = await new ReportService().generate(
      sessionId,
      flowIdToPayloadIdsMap as Record<string, string[]>,
      userId,
      flow_summary
    );
    apiResponse.successHTML(res, htmlReport);
    logger.info(MESSAGES.report.reportSent, {
      meta: {
        sessionId,
        userId,
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