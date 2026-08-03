import express from "express";
import {
  getCities,
  getSchoolsByCity,
  createStallReport,
  getApprovedStallReports,
  getAdminStallReports,
  approveStallReport,
  rejectStallReport,
} from "../controllers/stallReportController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";
import upload from "../middleware/upload.js";

const router = express.Router();

// Public routes
router.get("/cities", getCities);
router.get("/schools", getSchoolsByCity);
router.get("/approved/:petitionId", getApprovedStallReports);

// User submission route (Signers only) - supports up to 5 image uploads
router.post("/", protect, upload.array("images", 5), createStallReport);

// Admin management routes
router.get("/admin/reports", adminAuth, getAdminStallReports);
router.put("/admin/:id/approve", adminAuth, approveStallReport);
router.put("/admin/:id/reject", adminAuth, rejectStallReport);

export default router;
