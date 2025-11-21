import { fetchPayloads, fetchSessionDetails } from "./dbService";
import { sortPayloadsByCreatedAt } from "../utils/groupUtils";
import { validationModule } from "./validationModule";
import { utilityReport } from "./utilityService";
import { generateCustomHTMLReport } from "../templates/generateReport";
import { CacheService } from "./cacheService";
import logger from "@ondc/automation-logger";
import { ENABLED_DOMAINS, typeMapping } from "../utils/constants";
import axios from "axios";
import { generateTestsFromPayloads } from "../utils/payloadUtils";

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
      const reportableFlowMap = this.filterReportableFlows(
        flowMap,
        sessionDetails.flowConfigs || []
      );

      const currentStates = await this.fetchCurrentStates(
        sessionId,
        requestedFlows,
        reportableFlowMap
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

      // Check if domain is not in enabled domains - use Pramaan report
      if (!ENABLED_DOMAINS.includes(sessionDetails.domain)) {
        return await this.checkPramaanReport(sessionDetails, sessionId);
      }

      const result = await validationModule(flows, sessionId);
      return generateCustomHTMLReport(result);
    } catch (error) {
      logger.error(
        `Error generating report for session ${sessionId}:`,
        {},
        error
      );
      throw new Error(
        `Failed to generate report: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Checks Pramaan report when domain is not specified or not in enabled domains
   * @param sessionDetails - Session details object containing sessionId, domain, version, etc.
   * @returns Pramaan response data or error object
   */
  private async checkPramaanReport(
    sessionDetails: any,
    sessionId: string
  ): Promise<any> {
    const testId = `PW_${sessionId}`;
    const { tests, subscriber_id } = await generateTestsFromPayloads(
      sessionDetails.domain,
      sessionDetails.version,
      sessionDetails.usecaseId,
      sessionId
    );

    logger.info(
      `[ReportService] Checking Pramaan report for sessionId: ${sessionDetails.sessionId}, generated testId: ${testId}`
    );

    // Build request body for Pramaan
    const mappedType = typeMapping[sessionDetails.usecaseId];
    const body = {
      id: subscriber_id,
      version: sessionDetails.version,
      domain: sessionDetails.domain || undefined, // Handle case when domain is not specified
      environment: process.env.PRAMAAN_ENVIRONMENT || "Preprod",
      type: mappedType,
      tests,
      test_id: testId,
    };

    const pramaanUrl = process.env.PRAMAAN_URL;
    if (!pramaanUrl) {
      throw new Error("PRAMAAN_URL is not defined in environment variables");
    }

    logger.info(`Sending sync request to Pramaan at ${pramaanUrl}`);
    const pramaanResponse = await axios.post(pramaanUrl, body, {
      headers: { "Content-Type": "application/json" },
    });

    logger.info(
      `Received response from Pramaan: ${JSON.stringify(pramaanResponse.data)}`
    );

    // Extract ack status safely
    const ackStatus = pramaanResponse.data?.message?.ack?.status;

    if (ackStatus === "NACK") {
      logger.warning(`Pramaan responded with NACK for testId: ${testId}`);
      return {
        error: "Pramaan responded with NACK",
        response: pramaanResponse.data,
      } as any;
    }

    if (ackStatus === "ACK") {
      logger.info(`Pramaan responded with ACK for testId: ${testId}`);
      return pramaanResponse.data as any;
    }

    // Unexpected structure
    logger.error(`Unexpected Pramaan response format for testId: ${testId}`);
    return {
      error: "Unexpected response format from Pramaan",
      response: pramaanResponse.data,
    } as any;
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
  filterReportableFlows(
    flowMap: Record<string, string>,
    flowConfigs: any[]
  ): Record<string, string> {
    const result: Record<string, string> = {};

    for (const key of Object.keys(flowMap)) {
      const flow = flowConfigs.find((f) => f.id === key);

      if (!flow) continue; // no matching flow

      if (Array.isArray(flow.tags) && flow.tags.includes("REPORTABLE")) {
        result[key] = flowMap[key]; // keep only reportable ones
      }
    }

    return result;
  }
}
