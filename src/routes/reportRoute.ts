import express from 'express';
import { generateReportController } from '../controllers/reportController';

const router = express.Router();

router.get('/', generateReportController);

export default router;