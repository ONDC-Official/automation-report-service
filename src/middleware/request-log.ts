import { Request, Response, NextFunction } from "express";
import logger from "@ondc/automation-logger";

export default (req: Request, _res: Response, next: NextFunction) => {
    const transaction_id = req.body?.transaction_id;
    logger.info(`Request Log`, {
        message: `Request Log`,
        transaction_id,
        meta: {
        method: req.method,
        url: req.url,
        body: req.body
    }});
    next();
};
  