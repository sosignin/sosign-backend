import express from "express";
import {
  createCampaign,
  getCampaigns,
  getCampaignById,
  dummyDonate,
  getMyCampaigns,
  adminGetAllCampaigns,
  adminUpdateCampaignStatus,
  getCrowdfundingStats,
} from "../controllers/crowdfundingController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";
import crowdfundingUpload from "../middleware/crowdfundingUpload.js";

const router = express.Router();

const uploadFields = crowdfundingUpload.fields([
  { name: "image", maxCount: 1 },
  { name: "beneficiaryAadhaar", maxCount: 1 },
  { name: "beneficiaryPan", maxCount: 1 },
  { name: "organizerAadhaarPan", maxCount: 1 },
  { name: "reports", maxCount: 5 },
  { name: "cancelledCheque", maxCount: 1 },
]);

// Admin routes
router.get("/admin/all", adminAuth, adminGetAllCampaigns);
router.get("/admin/stats", adminAuth, getCrowdfundingStats);
router.put("/:id/status", adminAuth, adminUpdateCampaignStatus);

// User routes
router.get("/my", protect, getMyCampaigns);

router.route("/")
  .get(getCampaigns)
  .post(protect, uploadFields, createCampaign);

router.route("/:id")
  .get(getCampaignById);

router.route("/:id/donate").post(dummyDonate);

export default router;
