import { generateReportHTML } from "../templates/utilityReportTemplate";
import { Result } from "../types/result";
import logger from "@ondc/automation-logger";
import { MESSAGES } from "../utils/messages";
import { parseFlows } from "../utils/parseutils";
import { validateFlows } from "./validateLogs";
export async function utilityReport(flows: any, sessionID: string) {
  logger.info(MESSAGES.services.utilityEnter,
    MESSAGES.services.utilityEnter,
    {meta: {
      sessionID,
      flows,
    }},
  );
  //parse flows
  const parsedFlows = parseFlows(flows, sessionID);

  // Validate flows
  const validatedFlows: { flowId: string; results: Result }[] =
    await validateFlows(await parsedFlows);

  // Generate HTML report
  const htmlReport = generateReportHTML(validatedFlows);
  logger.info(MESSAGES.services.utilityExit,
    {meta: {
      sessionID,
      htmlReport,
    }},
  );
  return htmlReport;
}
