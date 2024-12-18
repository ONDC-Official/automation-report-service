import { Request, Response } from "express";
import { fetchPayloads } from "../services/dbService";
import { utilityReport } from "../services/utilityService";
import { groupAndSortPayloadsByFlowId } from "../utils/groupUtils";
import { validationModule } from "../services/validationModule";
import { generateCustomHTMLReport } from "../templates/generateReport"

export async function generateReportController(req: Request, res: Response) {
  try {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      res.status(400).send("Missing sessionId parameter");
      return;
    }

    // Fetch payloads
    const payloads = await fetchPayloads(sessionId);
    //Group payloads from flows
    const flows = groupAndSortPayloadsByFlowId(payloads);

    if (process.env.UTILITY === "true") {
      const htmlReport = await utilityReport(flows);
      res.status(200).send(htmlReport);
      return;
    }

    const result = await validationModule(flows);
    console.log(result);
    
    const htmlReport = generateCustomHTMLReport(result)
    res.status(200).send(htmlReport);
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).send("Failed to generate report");
  }
}
