import express from "express";
import {
  recordConsentLog,
  withdrawConsent,
  getAdminConsentLogs,
  exportConsentLogs,
} from "../controllers/consentController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Optional auth middleware for logging: if token is present, decode it, otherwise allow visitor
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    return protect(req, res, next);
  }
  next();
};

// Citizen & visitor consent recording
router.post("/log", optionalAuth, recordConsentLog);
router.post("/withdraw", protect, withdrawConsent);

// Admin compliance audit ledger routes
router.get("/admin/logs", adminAuth, getAdminConsentLogs);
router.get("/admin/export", adminAuth, exportConsentLogs);

export default router;
