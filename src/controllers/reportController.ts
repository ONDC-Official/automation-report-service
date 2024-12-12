import { Request, Response } from 'express';
import { fetchPayloads } from '../services/dbService';
import { validateFlows } from '../services/validateLogs';
import { generateReportHTML } from '../templates/reportTemplate';
import { groupPayloadsByFlowId } from '../utils/groupUtils';
import { parseFlows } from '../utils/parseutils';
import { ApiResponse } from '../types/utilityResponse';
import { Result } from '../types/result';

export async function generateReportController(req: Request, res: Response) {
  try {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      res.status(400).send('Missing sessionId parameter');
      return;
    }

    // Fetch payloads
    const payloads = await fetchPayloads(sessionId);

    // Group and parse flows
    const flows = groupPayloadsByFlowId(payloads);
    const parsedFlows = parseFlows(flows);
    console.log(await parsedFlows);
    

    // Validate flows
    const validatedFlows: { flowId: string, results: Result }[] = await validateFlows(await parsedFlows);

    // Generate HTML report
    const htmlReport = generateReportHTML(validatedFlows);

    res.status(200).send(htmlReport);
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).send('Failed to generate report');
  }
}