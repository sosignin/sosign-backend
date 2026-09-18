import express from "express";
import {
  createVictoryRequest,
  getVictoryRequests,
  checkVictoryRequestStatus,
  approveVictoryRequest,
  rejectVictoryRequest,
  getVictoryRequestStats,
} from "../controllers/victoryRequestController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// User endpoints
router.route("/").post(protect, createVictoryRequest);
router.route("/check/:petitionId").get(protect, checkVictoryRequestStatus);

// Admin endpoints
router.route("/").get(adminAuth, getVictoryRequests);
router.route("/stats").get(adminAuth, getVictoryRequestStats);
router.route("/:id/approve").put(adminAuth, approveVictoryRequest).post(adminAuth, approveVictoryRequest);
router.route("/:id/reject").put(adminAuth, rejectVictoryRequest).post(adminAuth, rejectVictoryRequest);

export default router;
