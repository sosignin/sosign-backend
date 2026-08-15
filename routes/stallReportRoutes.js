import express from "express";
import {
  getCities,
  getSchoolsByCity,
  createStallReport,
  getApprovedStallReports,
  getAdminStallReports,
  approveStallReport,
  rejectStallReport,
  requestNewSchool,
  getPendingSchoolRequests,
  approveSchoolRequest,
  updateSchoolRequest,
  rejectSchoolRequest,
  submitStallDefense,
  getStallDisputes,
  resolveStallDispute,
} from "../controllers/stallReportController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";
import upload from "../middleware/upload.js";

const router = express.Router();

// Public routes
router.get("/cities", getCities);
router.get("/schools", getSchoolsByCity);
router.get("/public-approved", getApprovedStallReports);
router.get("/approved/:petitionId", getApprovedStallReports);
router.post("/:id/defend", submitStallDefense);

// User submission route (Signers only)
router.post("/", protect, upload.array("images", 5), createStallReport);
router.post("/schools/request", protect, requestNewSchool);

// Admin management routes
router.get("/admin/reports", adminAuth, getAdminStallReports);
router.route("/admin/:id/approve").put(adminAuth, approveStallReport).post(adminAuth, approveStallReport);
router.route("/admin/:id/reject").put(adminAuth, rejectStallReport).post(adminAuth, rejectStallReport);

// Admin School & City Requests
router.get("/admin/school-requests", adminAuth, getPendingSchoolRequests);
router.put("/admin/school-requests/:id", adminAuth, updateSchoolRequest);
router.route("/admin/school-requests/:id/approve").put(adminAuth, approveSchoolRequest).post(adminAuth, approveSchoolRequest);
router.route("/admin/school-requests/:id/reject").put(adminAuth, rejectSchoolRequest).post(adminAuth, rejectSchoolRequest);

// Admin Stall Disputes / Vendor Defenses
router.get("/admin/disputes", adminAuth, getStallDisputes);
router.put("/admin/disputes/:reportId/:defenseId/resolve", adminAuth, resolveStallDispute);

export default router;
