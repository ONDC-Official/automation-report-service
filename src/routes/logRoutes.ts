import express from 'express';

import otelTracing from '../middleware/tracing';
import apiKeyValidation from '../middleware/api-key';
import { fetchLogsController } from '../controllers/logsController';

const router = express.Router();

router.get('/',apiKeyValidation,otelTracing("","query.sessionId"), fetchLogsController);

export default router;