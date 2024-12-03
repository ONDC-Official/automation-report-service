import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { reportingService } from './services/reportingService';
import { logger } from './utils/logger';

const app = express();
require('dotenv').config();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON requests
app.use(bodyParser.json());


app.post('/generate-report', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const transactionFlowMappings = req.body;

    if (typeof transactionFlowMappings !== 'object' || transactionFlowMappings === null) {
      res.status(400).json({ message: 'Transaction flow mappings must be provided as an object.' });
      return;
    }

    const transactionIds = Object.keys(transactionFlowMappings);

    if (transactionIds.length === 0) {
      res.status(400).json({ message: 'Transaction flow mappings must contain at least one transaction ID.' });
      return;
    }

    logger.info(`Received request for transaction flow mappings: ${JSON.stringify(transactionFlowMappings)}`);

    // Generate the report using the reporting service
    const htmlReport = await reportingService(transactionFlowMappings);

    // Set the response content type and send the report HTML
    res.setHeader('Content-Type', 'text/html');
    res.send(htmlReport);
    logger.info('HTML report sent successfully as the response.');
  } catch (error) {
    logger.error(`An error occurred while generating the report: ${(error as Error).message}`);
    res.status(500).json({ message: 'An error occurred while generating the report' });
  }
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Reporting service is running on http://localhost:${PORT}`);
});