import { fetchPayloads, fetchSessionDetails } from "./dbService";
import { sortPayloadsByCreatedAt } from "../utils/groupUtils";
import { validationModule } from "./validationModule";
import { utilityReport } from "./utilityService";
import { generateCustomHTMLReport } from "../templates/generateReport";
import { CacheService } from "./cacheService";
import { ENABLED_DOMAINS } from "../utils/constants";

export class ReportService {
  static async generate(sessionId: string, flowIdToPayloadIdsMap: Record<string, string[]>): Promise<string> {
    const sessionDetails = await fetchSessionDetails(sessionId);
    await CacheService.set(`sessionDetails:${sessionId}`, JSON.stringify(sessionDetails));
    const payloads = await fetchPayloads(flowIdToPayloadIdsMap);
    const flows = sortPayloadsByCreatedAt(payloads);

    console.log("flows=>>>>>>>>>>>>",JSON.stringify(flows));
    if (!ENABLED_DOMAINS.includes(sessionDetails?.domain)) {
      return await utilityReport(flows, sessionId);
    }

    const result = await validationModule(flows, sessionId);
    return generateCustomHTMLReport(result);
  }
}


