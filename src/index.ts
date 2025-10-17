import "./config/otelConfig"
import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import Router from "./routes/routes";
import { RedisService } from "ondc-automation-cache-lib";
import logger from "@ondc/automation-logger";

// Initialize dotenv to load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
// Set up Redis database connection
try {
  RedisService.useDb(0);
} catch (err) {
  logger.error("Error in setting up Redis Database connection",{},err);
}

// Middleware setup
app.use(express.json());

// Routes
app.use("/", Router);

// Global error handler middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // logger.error(err.stack);
  logger.error("Internal server error",{},err);
  res.status(500).send("Something went wrong!");
});

// Start the server
app.listen(PORT, () => {
  // logger.info(`Server is running on http://localhost:${PORT}`);
  logger.info(`Server is running on http://localhost:${PORT}`)
});
