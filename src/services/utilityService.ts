import { generateReportHTML } from "../templates/utilityReportTemplate";
import { Result } from "../types/result";
import { logInfo } from "../utils/logger";
import { parseFlows } from "../utils/parseutils";
import { validateFlows } from "./validateLogs";
import logger from "@ondc/automation-logger";
export async function utilityReport(flows: any, sessionID: string) {
  //parse flows
  const parsedFlows = parseFlows(flows, sessionID);

  // Validate flows
  const validatedFlows: { flowId: string; results: Result }[] =
    await validateFlows(await parsedFlows);

  // Generate HTML report
  const htmlReport = generateReportHTML(validatedFlows);

  return htmlReport;
}
