import express from 'express';
import { generateReportController } from '../controllers/reportController';

const router = express.Router();

router.post('/generate-report', generateReportController);

export default router;