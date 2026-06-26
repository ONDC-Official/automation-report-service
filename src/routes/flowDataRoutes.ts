import { Router } from "express";
import { fetchFlowDataController } from "../controllers/flowDataController";

const router = Router();

router.post("/", fetchFlowDataController);

export default router;
