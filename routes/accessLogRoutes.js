import express from "express";
import {
  getAccessLogs,
  getAccessLogStats,
  exportAccessLogs,
} from "../controllers/accessLogController.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

router.use(adminAuth);

router.get("/", getAccessLogs);
router.get("/stats", getAccessLogStats);
router.get("/export", exportAccessLogs);

export default router;
