import { fetchPayloads, fetchSessionDetails } from "./dbService";
import { sortPayloadsByCreatedAt } from "../utils/groupUtils";
import { validationModule } from "./validationModule";
import { utilityReport } from "./utilityService";
import { generateCustomHTMLReport } from "../templates/generateReport";
import { CacheService } from "./cacheService";
import { ENABLED_DOMAINS } from "../utils/constants";
import axios from "axios";

export class ReportService {

  static async generate(
    sessionId: string,
    flowIdToPayloadIdsMap: Record<string, string[]>
  ): Promise<string> {

    const sessionDetails = await fetchSessionDetails(sessionId);

    await CacheService.set(`sessionDetails:${sessionId}`,JSON.stringify(sessionDetails));

    const requestedFlows = Object.keys(flowIdToPayloadIdsMap);
    const flowMap: Record<string, string> = sessionDetails?.flowMap ?? {};

    const currentStates = await ReportService.fetchCurrentStates(sessionId,requestedFlows,flowMap);

    await CacheService.set(`flowStates:${sessionId}`,JSON.stringify(currentStates));

    const payloadIdsFromStates = ReportService.buildPayloadIdsFromStates(currentStates);

    const payloads = await fetchPayloads(payloadIdsFromStates);

    const payloadIdToActionId = ReportService.buildPayloadIdToActionId(currentStates);

    ReportService.annotatePayloadsWithActionId(payloads, payloadIdToActionId);

    const flows = sortPayloadsByCreatedAt(payloads);

    if (!ENABLED_DOMAINS.includes(sessionDetails?.domain)) {
      return await utilityReport(flows, sessionId);
    }

    const result = await validationModule(flows, sessionId);
    return generateCustomHTMLReport(result);
  }

  private static async fetchCurrentStates(
    sessionId: string,
    flowNames: string[],
    flowMap: Record<string, string>
  ): Promise<Record<string, any>> {
    const entries = await Promise.all(
      flowNames.map(async (flowName) => {
        const txnId = flowMap[flowName];
        if (!txnId) return [flowName, null] as const;
        const { data } = await axios.get(
          `${process.env.AUTOMATION_BACKEND}/flow/current-state`,
          {
            params: { transaction_id: txnId, session_id: sessionId },
          }
        );
        return [flowName, data] as const;
      })
    );
    return Object.fromEntries(entries);
  }

  private static buildPayloadIdsFromStates(
    currentStates: Record<string, any>
  ): Record<string, string[]> {
    return Object.fromEntries(
      Object.entries(currentStates).map(([flowName, state]: [string, any]) => {
        const ids: string[] = (state?.sequence ?? []).flatMap((step: any) =>
          (step?.payloads?.payloads ?? [])
            .map((p: any) => p?.payloadId)
            .filter(Boolean)
        );
        return [flowName, ids];
      })
    );
  }

  private static buildPayloadIdToActionId(
    currentStates: Record<string, any>
  ): Map<string, string> {
    const map = new Map<string, string>();
    Object.values(currentStates).forEach((state: any) => {
      (state?.sequence ?? []).forEach((step: any) => {
        const actionId: string | undefined = step?.actionId;
        (step?.payloads?.payloads ?? []).forEach((p: any) => {
          const pid = p?.payloadId;
          if (pid && actionId) map.set(pid, actionId);
        });
      });
    });
    return map;
  }

  private static annotatePayloadsWithActionId(
    payloads: Record<string, any[]>,
    payloadIdToActionId: Map<string, string>
  ): void {
    Object.values(payloads).forEach((arr) => {
      arr.forEach((p) => {
        const actionId = payloadIdToActionId.get(p.payloadId);
        if (actionId) p.action_id = actionId;
      });
    });
  }
}
