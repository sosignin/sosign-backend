import express from "express";
import {
  getBackups,
  triggerBackup,
  downloadBackup,
  verifyBackup,
} from "../controllers/backupController.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

router.use(adminAuth);

router.get("/", getBackups);
router.post("/create", triggerBackup);
router.get("/:id/download", downloadBackup);
router.post("/:id/verify", verifyBackup);

export default router;
