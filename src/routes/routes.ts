import { Router } from "express"; 
import apiKeyMiddleware from "../middleware/api-key"; // Import API key middleware
import ReportRoutes from "./reportRoutes"; // Import report routes
import LogRoutes from "./reportRoutes";
const router = Router();

// Mount session and payload related routes
router.use(apiKeyMiddleware);
router.use("/",ReportRoutes);
router.use("/logs",LogRoutes);

export default router;