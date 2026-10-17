import express from "express";
import {
  createDeletionRequest,
  getMyDeletionRequest,
  cancelDeletionRequest,
  getAdminDeletionRequests,
  approveDeletionRequest,
  rejectDeletionRequest,
  getDeletedUserArchives,
  getDeletedUserArchiveById,
} from "../controllers/deletionRequestController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// User routes (protected)
router.route("/").post(protect, createDeletionRequest);
router.route("/my").get(protect, getMyDeletionRequest);
router.route("/cancel").put(protect, cancelDeletionRequest).post(protect, cancelDeletionRequest);

// Legal Safety & Compliance Archive Vault routes (Admin)
router.get("/archives", adminAuth, getDeletedUserArchives);
router.get("/archives/:id", adminAuth, getDeletedUserArchiveById);
router.get("/admin/archives", adminAuth, getDeletedUserArchives);
router.get("/admin/archives/:id", adminAuth, getDeletedUserArchiveById);

// Admin requests routes (direct and /admin prefixed)
router.get("/", adminAuth, getAdminDeletionRequests);
router.get("/admin", adminAuth, getAdminDeletionRequests);
router.get("/admin/all", adminAuth, getAdminDeletionRequests);

router.route("/:id/approve").put(adminAuth, approveDeletionRequest).post(adminAuth, approveDeletionRequest);
router.route("/admin/:id/approve").put(adminAuth, approveDeletionRequest).post(adminAuth, approveDeletionRequest);

router.route("/:id/reject").put(adminAuth, rejectDeletionRequest).post(adminAuth, rejectDeletionRequest);
router.route("/admin/:id/reject").put(adminAuth, rejectDeletionRequest).post(adminAuth, rejectDeletionRequest);

export default router;
