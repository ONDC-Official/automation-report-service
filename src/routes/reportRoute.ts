import express from 'express';
import { generateReportController } from '../controllers/reportController';
import otelTracing from '../middleware/tracing';

const router = express.Router();

router.post('/generate-report',otelTracing("","query.sessionId"), generateReportController);

export default router;