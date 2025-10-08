import { Request, Response } from "express";
import { getPayloadsByTransactionAndSession } from "../services/dbService";
import { mapPayloadsToLogFormat } from "../utils/payloadUtils";

export const fetchLogsController = async (req: Request, res: Response) => {
  try {
    const { test_id, transaction_id } = req.query;

    if (!transaction_id) {
      res.status(400).json({ error: "transaction_id is required" });
    }

    // Extract sessionId from test_id (remove 'PW_' prefix)
    const sessionId = typeof test_id === "string" ? test_id.replace(/^PW_/, ""): undefined;

    // Fetch payloads/logs from DB API
    const payloads = await getPayloadsByTransactionAndSession(
      transaction_id as string,
      sessionId
    );
    const formattedLogs = mapPayloadsToLogFormat(payloads);
    res.status(200).json({ formattedLogs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};