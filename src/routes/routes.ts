import { Router } from "express"; 
import apiKeyMiddleware from "../middleware/api-key"; // Import API key middleware
import ReportRoutes from "./reportRoutes"; // Import report routes
import LogRoutes from "./logRoutes";
import CallbackRoutes from "./callbackRoutes";
const router = Router();

// Mount session and payload related routes
router.use(apiKeyMiddleware);
router.use("/report/generate-report",ReportRoutes);
router.use("/logs",LogRoutes);
router.use("/callback",CallbackRoutes)

export default router;