import express from 'express';
import { generateReportController } from '../controllers/reportController';
import otelTracing from '../middleware/tracing';
import apiKeyValidation from '../middleware/api-key';

const router = express.Router();

router.post('/generate-report',apiKeyValidation,otelTracing("","query.sessionId"), generateReportController);
export default router;