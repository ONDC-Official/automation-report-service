import { generateReportHTML } from "../templates/utilityReportTemplate";
import { Result } from "../types/result";
import { logInfo } from "../utils/logger";
import { parseFlows } from "../utils/parseutils";
import { validateLogs } from "./validateLogs";

export async function utilityReport(flows: any, sessionID: string) {
  logInfo({
    message: "Entering utilityReport function. Generating utility report...",
    meta: { sessionID, flows },
    });
  
  // Extract search and on_search payloads from FULL_CATALOG flow
  let catalogPayloads: any = null;
  if (flows.FULL_CATALOG) {
    const fullCatalogPayloads = flows.FULL_CATALOG;
    catalogPayloads = {
      search: fullCatalogPayloads.find((p: any) => p.action?.toLowerCase() === 'search'),
      on_search: fullCatalogPayloads.find((p: any) => p.action?.toLowerCase() === 'on_search')
    };
    logInfo({
      message: "Extracted catalog payloads from FULL_CATALOG",
      meta: { 
        hasSearch: !!catalogPayloads.search,
        hasOnSearch: !!catalogPayloads.on_search
      }
    });
  }
  
  //parse flows
  const parsedFlows = await parseFlows(flows, sessionID, true, catalogPayloads);

  // Validate flows
  const validatedFlows: { flowId: string; results: Result }[] = await Promise.all(
    Object.entries(flows).map(async ([flowId]) => {
      const parsed = parsedFlows[flowId];
      
      // For utility flows, use the parsed payload keys directly
      const originalPayloads = Object.entries(parsed.payload).map(([key, jsonRequest]) => ({
        key,
        jsonRequest
      }));
      
      const results = await validateLogs(flowId, parsed, originalPayloads, { isUtility: true, sessionId: sessionID });
      return { flowId, results };
    })
  );

  // Generate HTML report
  const htmlReport = generateReportHTML(validatedFlows);
  
  logInfo({
    message: "Exiting utilityReport function. Generated utility report.",
    meta: { sessionID, htmlReport },
  });
  return htmlReport;
}
