import express from "express";
import {
    createHideRequest,
    getHideRequests,
    checkHideRequestStatus,
    approveHideRequest,
    rejectHideRequest,
    getHideRequestStats,
} from "../controllers/hideRequestController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// User routes (protected)
router.route("/").post(protect, createHideRequest);
router.route("/check/:petitionId").get(protect, checkHideRequestStatus);

// Admin routes
router.route("/").get(adminAuth, getHideRequests);
router.route("/stats").get(adminAuth, getHideRequestStats);
router.route("/:id/approve").put(adminAuth, approveHideRequest).post(adminAuth, approveHideRequest);
router.route("/:id/reject").put(adminAuth, rejectHideRequest).post(adminAuth, rejectHideRequest);

export default router;
