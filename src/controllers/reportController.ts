import { Request, Response } from "express";
import { fetchPayloads } from "../services/dbService";
import { utilityReport } from "../services/utilityService";
import { groupAndSortPayloadsByFlowId } from "../utils/groupUtils";
import { validationModule } from "../services/validationModule";
import { generateCustomHTMLReport } from "../templates/generateReport";

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

    // const res1 = {
    //   flow_id: {
    //     valid_flow: true,
    //     errors: [],
    //     messages: {
    //       search_1: '{"response":{"ack":{"status":"ACK"}},"passed":["Should have valid context with transactionId and timestamp"],"failed":["Should have valid message with intent"]}',
    //       on_search_1: '{"response":{"ack":{"status":"NACK"}, "error":{"code":3001,"message":"quote price incorrect"}},"passed":[],"failed":["testFunction is not a function"]}',
    //       search_2: '{"response":"Method Not Allowed","passed":["Should have valid context with transactionId and timestamp"],"failed":["Should have valid message with intent"]}',
    //       on_search_2: '{"response":{"ack":{"status":"ACK"}},"passed":[],"failed":["testFunction is not a function"]}',
    //       select_1: '{"response":{"ack":{"status":"ACK"}},"passed":[],"failed":["Action not found"]}',
    //       on_select_1: '{"response":{"ack":{"status":"ACK"}},"passed":[],"failed":["Action not found"]}',
    //       init_1: '{"response":{"ack":{"status":"NACK"}, "error":{"code":3001,"message":"no response"}},"passed":[],"failed":["Action not found"]}',
    //       on_init_1: '{"response":{"ack":{"status":"NACK"}, "error":{"code":3001,"message":"no response"}},"passed":[],"failed":["Action not found"]}',
    //       confirm_1: '{"response":{"ack":{"status":"NACK"}, "error":{"code":3001,"message":"no response"}},"passed":[],"failed":["Action not found"]}',
    //       on_confirm_1: '{"response":{"ack":{"status":"NACK"}, "error":{"code":3001,"message":"no response"}},"passed":[],"failed":["Action not found"]}'
    //     }
    //   }
    // }

    const htmlReport = generateCustomHTMLReport(result);
    res.status(200).send(htmlReport);
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).send("Failed to generate report");
  }
}
