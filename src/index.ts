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
        const flowTransactionMappings = req.body;
    
        if (
          typeof flowTransactionMappings !== "object" ||
          Object.keys(flowTransactionMappings).length === 0
        ) {
          res.status(400).json({ message: "Flow mappings must be provided as an object." });
          return;
        }
    
        logger.info(`Received request for flows: ${Object.keys(flowTransactionMappings).join(", ")}`);
    
        // Generate the report using the reporting service
        const htmlReport = await reportingService(flowTransactionMappings);
    
        // Set the response content type and send the report HTML
        res.setHeader("Content-Type", "text/html");
        res.send(htmlReport);
        logger.info("HTML report sent successfully.");
      } catch (error) {
        logger.error(`An error occurred while generating the report: ${(error as Error).message}`);
        res.status(500).json({ message: "An error occurred while generating the report" });
      }
    });

// Start the server
app.listen(PORT, () => {
  logger.info(`Reporting service is running on http://localhost:${PORT}`);
});