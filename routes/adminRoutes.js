import express from "express";
import {
  adminLogin,
  adminLogout,
  getCurrentAdmin,
  getUsers,
  getUnapprovedPetitions,
  getRejectedPetitions,
  approvePetition,
  rejectPetition,
  resetPetition,
  getAdminStats,
  getWallets,
  toggleUserSuspension,
  getVerifiedUsers,
  createDummyUser,
  createDummyPetition,
  addDummySignatures,
  resetUserKyc,
  updateUserMobile,
  updateUserName,
  loginAsUser,
  updateUserPlan,
  toggleBannerFeature,
  getBannerPetitions,
  toggleSchoolStallMap,
  updatePetitionSlug,
  getAutoSignSchedules,
  createAutoSignSchedule,
  pauseAutoSignSchedule,
  resumeAutoSignSchedule,
  cancelAutoSignSchedule,
  deleteAutoSignSchedule,
  triggerAutoSignTick,
  handleCronTick,
  linkMotherChildPetitions,
  unlinkMotherChildPetition,
  getMotherChildHierarchy,
} from "../controllers/adminController.js";
import {
  getAdminPetitionReports,
  updatePetitionReportStatus,
  takeDownPetitionFromReport,
} from "../controllers/petitionReportController.js";
import { getSeoKeywords } from "../controllers/seoController.js";
import { getGscStatus, getGscPerformance, inspectUrl, submitSitemap, publishToIndex } from "../controllers/gscController.js";
import {
  adminGetPlans,
  adminCreatePlan,
  adminUpdatePlan,
  adminDeletePlan,
} from "../controllers/planController.js";
import { adminAuth } from "../middleware/adminAuth.js";
import {
  getPetitions,
  getAllPetitionsForAdmin,
  getPetitionById,
  deletePetition,
  getAdminPetitionSignatures,
} from "../controllers/petitionController.js";
import {
  getSuccessfulPetitions,
  getSuccessfulPetitionById,
  deleteSuccessfulPetition,
} from "../controllers/successfulPetitionController.js";
import {
  getCommentsByPetition,
  deleteComment,
} from "../controllers/commentController.js";

const router = express.Router();

// Public route
router.post("/login", adminLogin);

// Protected route
router.get("/me", adminAuth, getCurrentAdmin);

// Get admin dashboard stats
router.get("/stats", adminAuth, getAdminStats);

// ✅ Logout route should NOT use adminAuth middleware
router.post("/logout", adminLogout);

//get user info
router.get("/customers", getUsers);

// Toggle user suspension
router.route("/customers/:id/suspend").put(adminAuth, toggleUserSuspension).post(adminAuth, toggleUserSuspension);

// Update/reset user mobile number
router.route("/customers/:id/mobile").put(adminAuth, updateUserMobile).post(adminAuth, updateUserMobile);

// Update user name
router.route("/customers/:id/name").put(adminAuth, updateUserName).post(adminAuth, updateUserName);

// Impersonate user (Login as user)
router.post("/customers/:id/login-as", adminAuth, loginAsUser);

// Update user plan & points balance
router.route("/customers/:id/plan").put(adminAuth, updateUserPlan).post(adminAuth, updateUserPlan);

// Admin pricing plan package config CRUD
router.get("/plans", adminAuth, adminGetPlans);
router.post("/plans", adminAuth, adminCreatePlan);
router.route("/plans/:id").put(adminAuth, adminUpdatePlan).delete(adminAuth, adminDeletePlan).post(adminAuth, (req, res, next) => {
  if (req.body?._action === "delete" || req.query?._action === "delete") {
    return adminDeletePlan(req, res, next);
  }
  return adminUpdatePlan(req, res, next);
});

// Get verified users (DigiLocker KYC)
router.get("/verified-users", adminAuth, getVerifiedUsers);

// Dummy creation routes
router.post("/dummy/user", adminAuth, createDummyUser);
router.post("/dummy/petition", adminAuth, createDummyPetition);
router.post("/dummy/sign", adminAuth, addDummySignatures);
router.post("/reset-kyc", adminAuth, resetUserKyc);
router.post("/seo-keywords", adminAuth, getSeoKeywords);

// Auto-sign schedule routes
router.get("/auto-sign/schedules", adminAuth, getAutoSignSchedules);
router.post("/auto-sign/schedules", adminAuth, createAutoSignSchedule);
router.patch("/auto-sign/schedules/:id/pause", adminAuth, pauseAutoSignSchedule);
router.patch("/auto-sign/schedules/:id/resume", adminAuth, resumeAutoSignSchedule);
router.patch("/auto-sign/schedules/:id/cancel", adminAuth, cancelAutoSignSchedule);
router.delete("/auto-sign/schedules/:id", adminAuth, deleteAutoSignSchedule);
router.post("/auto-sign/tick", adminAuth, triggerAutoSignTick);
router.get("/auto-sign/cron-tick", handleCronTick);
router.post("/auto-sign/cron-tick", handleCronTick);

// Google Search Console integration
router.get("/gsc/status", adminAuth, getGscStatus);
router.post("/gsc/performance", adminAuth, getGscPerformance);
router.post("/gsc/inspect", adminAuth, inspectUrl);
router.post("/gsc/submit-sitemap", adminAuth, submitSitemap);
router.post("/gsc/publish", adminAuth, publishToIndex);

// Admin file upload helper
import upload from "../middleware/upload.js";
router.post("/upload", adminAuth, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    res.status(200).json({ success: true, url: req.file.path });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user wallets
router.get("/wallets", adminAuth, getWallets);

// Get unapproved petitions
router.get("/petitions/unapproved", adminAuth, getUnapprovedPetitions);
router.get("/petitions/rejected", adminAuth, getRejectedPetitions);
// Approve/Reject/Reset petition
router.route("/petitions/:id/approve").put(adminAuth, approvePetition).post(adminAuth, approvePetition);
router.route("/petitions/:id/reject").put(adminAuth, rejectPetition).post(adminAuth, rejectPetition);
router.route("/petitions/:id/reset").put(adminAuth, resetPetition).post(adminAuth, resetPetition);

// Admin petition management routes
router.get("/petitions/banner", adminAuth, getBannerPetitions);
router.route("/petitions/:id/banner-feature").put(adminAuth, toggleBannerFeature).post(adminAuth, toggleBannerFeature);
router.route("/petitions/:id/school-stall-map").put(adminAuth, toggleSchoolStallMap).post(adminAuth, toggleSchoolStallMap);
router.route("/petitions/:id/slug").put(adminAuth, updatePetitionSlug).post(adminAuth, updatePetitionSlug);
router.get("/petitions-hierarchy/mother-child", adminAuth, getMotherChildHierarchy);
router.route("/petitions/link-mother-child").put(adminAuth, linkMotherChildPetitions).post(adminAuth, linkMotherChildPetitions);
router.route("/petitions/:id/unlink-mother").put(adminAuth, unlinkMotherChildPetition).post(adminAuth, unlinkMotherChildPetition);
router.get("/petitions", adminAuth, getAllPetitionsForAdmin);
router.get("/petitions/:id", adminAuth, getPetitionById);
router.get("/petitions/:id/signatures", adminAuth, getAdminPetitionSignatures);
router.route("/petitions/:id").delete(adminAuth, deletePetition).post(adminAuth, deletePetition);

// Admin petition objection reports routes
router.get("/petition-reports", adminAuth, getAdminPetitionReports);
router.route("/petition-reports/:id/status").put(adminAuth, updatePetitionReportStatus).post(adminAuth, updatePetitionReportStatus);
router.route("/petition-reports/:id/takedown").put(adminAuth, takeDownPetitionFromReport).post(adminAuth, takeDownPetitionFromReport);

// Admin successful petition management routes
router.get("/successful-petitions", adminAuth, getSuccessfulPetitions);
router.get("/successful-petitions/:id", adminAuth, getSuccessfulPetitionById);
router.route("/successful-petitions/:id").delete(adminAuth, deleteSuccessfulPetition).post(adminAuth, deleteSuccessfulPetition);

// Admin comment management routes
router.get("/petitions/:petitionId/comments", adminAuth, getCommentsByPetition);
router.route("/comments/:id").delete(adminAuth, deleteComment).post(adminAuth, deleteComment);

// Admin wallet management routes
router.get("/wallets", adminAuth, async (req, res) => {
  try {
    const Wallet = await import("../models/walletModel.js").then(m => m.default);
    const User = await import("../models/userModel.js").then(m => m.default);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalWallets = await Wallet.countDocuments();
    const wallets = await Wallet.find()
      .populate("userId", "name email mobileNumber uniqueCode")
      .sort({ balance: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      wallets,
      currentPage: page,
      totalPages: Math.ceil(totalWallets / limit),
      totalWallets,
      limit
    });
  } catch (error) {
    console.error("Error fetching admin wallets:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin progress update management routes
router.get("/progress-updates", adminAuth, async (req, res) => {
  try {
    const ProgressUpdate = await import("../models/progressUpdateModel.js").then(m => m.default);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalUpdates = await ProgressUpdate.countDocuments();
    const updates = await ProgressUpdate.find()
      .populate("author", "name email profilePicture")
      .populate("petition", "title")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json({
      success: true,
      updates,
      currentPage: page,
      totalPages: Math.ceil(totalUpdates / limit),
      totalUpdates,
      limit
    });
  } catch (error) {
    console.error("Error fetching admin progress updates:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const deleteProgressUpdateHandler = async (req, res) => {
  try {
    const ProgressUpdate = await import("../models/progressUpdateModel.js").then(m => m.default);
    const update = await ProgressUpdate.findByIdAndDelete(req.params.id);
    
    if (!update) {
      return res.status(404).json({ success: false, message: "Progress update not found" });
    }

    res.status(200).json({ success: true, message: "Progress update deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
router.route("/progress-updates/:id").delete(adminAuth, deleteProgressUpdateHandler).post(adminAuth, deleteProgressUpdateHandler);

import {
  getAdminClaims,
  approveClaim,
  rejectClaim,
} from "../controllers/requestedSignatureClaimController.js";

// Requested Signature Verification Claims admin routes
router.get("/requested-signature-claims", adminAuth, getAdminClaims);
router.put("/requested-signature-claims/:claimId/approve", adminAuth, approveClaim);
router.post("/requested-signature-claims/:claimId/approve", adminAuth, approveClaim);
router.put("/requested-signature-claims/:claimId/reject", adminAuth, rejectClaim);
router.post("/requested-signature-claims/:claimId/reject", adminAuth, rejectClaim);

export default router;
