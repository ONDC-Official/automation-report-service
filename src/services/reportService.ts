import { fetchPayloads, fetchSessionDetails } from "./dbService";
import { sortPayloadsByCreatedAt } from "../utils/groupUtils";
import { validationModule } from "./validationModule";
import { utilityReport } from "./utilityService";
import { generateCustomHTMLReport } from "../templates/generateReport";
import { CacheService } from "./cacheService";
import { ENABLED_DOMAINS } from "../utils/constants";
import axios from "axios";

export class ReportService {
  async generate(
    sessionId: string,
    flowIdToPayloadIdsMap: Record<string, string[]>
  ): Promise<string> {
    try {
      // Fetch session details first
      const sessionDetails = await fetchSessionDetails(sessionId);

      if (!sessionDetails) {
        throw new Error(`Session details not found for session: ${sessionId}`);
      }

      // Cache session details (non-blocking)
      CacheService.set(
        `sessionDetails:${sessionId}`,
        JSON.stringify(sessionDetails)
      ).catch(console.error);

      const requestedFlows = Object.keys(flowIdToPayloadIdsMap);
      const flowMap: Record<string, string> = sessionDetails?.flowMap ?? {};

      // Fetch current states
      const currentStates = await this.fetchCurrentStates(
        sessionId,
        requestedFlows,
        flowMap
      );

      // Cache current states (non-blocking)
      CacheService.set(
        `flowStates:${sessionId}`,
        JSON.stringify(currentStates)
      ).catch(console.error);

      // Build payload IDs and action ID mapping in parallel
      const [payloadIdsFromStates, payloadIdToActionId] = await Promise.all([
        Promise.resolve(this.buildPayloadIdsFromStates(currentStates)),
        Promise.resolve(this.buildPayloadIdToActionId(currentStates)),
      ]);

      const payloads = await fetchPayloads(payloadIdsFromStates);
      this.annotatePayloadsWithActionId(payloads, payloadIdToActionId);

      const flows = sortPayloadsByCreatedAt(payloads);

      if (!ENABLED_DOMAINS.includes(sessionDetails?.domain)) {
        return await utilityReport(flows, sessionId);
      }

      const result = await validationModule(flows, sessionId);
      return generateCustomHTMLReport(result);
    } catch (error) {
      console.error(`Error generating report for session ${sessionId}:`, error);
      throw new Error(
        `Failed to generate report: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async fetchCurrentStates(
    sessionId: string,
    flowNames: string[],
    flowMap: Record<string, string>
  ): Promise<Record<string, any>> {
    try {
      const entries = await Promise.all(
        flowNames.map(async (flowName) => {
          const txnId = flowMap[flowName];
          if (!txnId) {
            console.warn(`No transaction ID found for flow: ${flowName}`);
            return [flowName, null] as const;
          }

          try {
            const { data } = await axios.get(
              `${process.env.AUTOMATION_BACKEND}/flow/current-state`,
              {
                params: { transaction_id: txnId, session_id: sessionId },
                timeout: 10000, // 10 second timeout
              }
            );
            return [flowName, data] as const;
          } catch (error) {
            console.error(
              `Failed to fetch current state for flow ${flowName}:`,
              error
            );
            return [flowName, null] as const;
          }
        })
      );
      return Object.fromEntries(entries);
    } catch (error) {
      console.error("Error in fetchCurrentStates:", error);
      throw new Error(
        `Failed to fetch current states for session ${sessionId}`
      );
    }
  }

  buildPayloadIdsFromStates(
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

  buildPayloadIdToActionId(
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

  annotatePayloadsWithActionId(
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
