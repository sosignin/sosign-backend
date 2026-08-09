import express from "express";
import { recordVisit, getTrafficStats } from "../controllers/trafficController.js";

const router = express.Router();

router.post("/visit", recordVisit);
router.get("/stats", getTrafficStats);

export default router;
