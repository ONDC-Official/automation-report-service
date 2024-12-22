import express, { Request, Response } from "express";
import reportRouter from "./routes/reportRoute";
// import { RedisService } from "ondc-automation-cache-lib";
import { logger } from "./utils/logger";

import dotenv from "dotenv";  // Import dotenv to load environment variables


const app = express();
const PORT = process.env.PORT || 3000;
dotenv.config();  // Load environment variables from the .env file
// try {
//   RedisService.useDb(2);
// } catch (err) {
//   logger.error(err);
// }

app.use(express.json());
app.use("/generate-report", reportRouter);

app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error(err.stack);
  res.status(500).send("Something went wrong!");
});

app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
});
