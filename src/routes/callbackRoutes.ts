import express from 'express';

import otelTracing from '../middleware/tracing';
import apiKeyValidation from '../middleware/api-key';
import { pramaanCallbackController } from '../controllers/pramaanCallbackController';

const router = express.Router();

router.post('/:testId',apiKeyValidation,otelTracing("","query.sessionId"), pramaanCallbackController);

export default router;