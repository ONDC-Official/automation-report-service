import { Request, Response, NextFunction } from "express";
import logger from "@ondc/automation-logger";
import { MESSAGES } from "../utils/messages";
import { apiResponse } from "../utils/responseHandler";
export default (req: Request, res: Response, next: NextFunction) => {
    const clientApiKey = req.get("x-api-key");
    const serverApiKey = process.env.API_SERVICE_KEY;

    if(!serverApiKey) {
        logger.error(MESSAGES.auth.apiKeyNotConfigured, {
            message: MESSAGES.auth.apiKeyNotConfigured
        });
        throw new Error(MESSAGES.auth.apiKeyNotConfigured);
    }

    if (!clientApiKey) {
        apiResponse.forbidden(res, MESSAGES.auth.apiKeyMissing);
        return;
    }
    
    if(!(serverApiKey === clientApiKey)) {
        apiResponse.forbidden(res, MESSAGES.auth.apiKeyInvalid);
        return;
    }
    next();
};
  