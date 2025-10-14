import { Request, Response, NextFunction } from "express";
import { reportEmitter } from "../utils/eventEmitter";
import { logger } from "../utils/logger";

export const pramaanCallbackController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const testId = req.params.testId;
    const base64Data = req.body.data;
    logger.info(`Received callback for testId: ${testId}`);
    if (!base64Data) {
      reportEmitter.emit(testId, { error: "Missing data in callback" });
      res.status(400).send("Missing data in callback");
      return;
    }

    reportEmitter.emit(testId, { base64Data });
    res.status(200).send({ message: "Report received successfully" });
  } catch (err: any) {
    logger.error(err);
    res.status(500).send({ error: err.message });
  }
};
