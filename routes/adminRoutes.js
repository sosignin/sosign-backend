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
} from "../controllers/adminController.js";
import { getSeoKeywords } from "../controllers/seoController.js";
import { getGscStatus, getGscPerformance, inspectUrl, submitSitemap } from "../controllers/gscController.js";
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
router.put("/customers/:id/suspend", adminAuth, toggleUserSuspension);

// Update/reset user mobile number
router.put("/customers/:id/mobile", adminAuth, updateUserMobile);

// Update user name
router.put("/customers/:id/name", adminAuth, updateUserName);

// Impersonate user (Login as user)
router.post("/customers/:id/login-as", adminAuth, loginAsUser);

// Update user plan & points balance
router.put("/customers/:id/plan", adminAuth, updateUserPlan);

// Admin pricing plan package config CRUD
router.get("/plans", adminAuth, adminGetPlans);
router.post("/plans", adminAuth, adminCreatePlan);
router.put("/plans/:id", adminAuth, adminUpdatePlan);
router.delete("/plans/:id", adminAuth, adminDeletePlan);

// Get verified users (DigiLocker KYC)
router.get("/verified-users", adminAuth, getVerifiedUsers);

// Dummy creation routes
router.post("/dummy/user", adminAuth, createDummyUser);
router.post("/dummy/petition", adminAuth, createDummyPetition);
router.post("/dummy/sign", adminAuth, addDummySignatures);
router.post("/reset-kyc", adminAuth, resetUserKyc);
router.post("/seo-keywords", adminAuth, getSeoKeywords);

// Google Search Console integration
router.get("/gsc/status", adminAuth, getGscStatus);
router.post("/gsc/performance", adminAuth, getGscPerformance);
router.post("/gsc/inspect", adminAuth, inspectUrl);
router.post("/gsc/submit-sitemap", adminAuth, submitSitemap);

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
// Approve petition
router.put("/petitions/:id/approve", adminAuth, approvePetition);
router.put("/petitions/:id/reject", adminAuth, rejectPetition);
router.put("/petitions/:id/reset", adminAuth, resetPetition);

// Admin petition management routes
router.get("/petitions", adminAuth, getAllPetitionsForAdmin);
router.get("/petitions/:id", adminAuth, getPetitionById);
router.delete("/petitions/:id", adminAuth, deletePetition);

// Admin successful petition management routes
router.get("/successful-petitions", adminAuth, getSuccessfulPetitions);
router.get("/successful-petitions/:id", adminAuth, getSuccessfulPetitionById);
router.delete("/successful-petitions/:id", adminAuth, deleteSuccessfulPetition);

// Admin comment management routes
router.get("/petitions/:petitionId/comments", adminAuth, getCommentsByPetition);
router.delete("/comments/:id", adminAuth, deleteComment);

// Admin wallet management routes
router.get("/wallets", adminAuth, async (req, res) => {
  try {
    const Wallet = await import("../models/walletModel.js").then(m => m.default);
    const User = await import("../models/userModel.js").then(m => m.default);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const totalWallets = await Wallet.countDocuments();

    // Get wallets with user info
    const wallets = await Wallet.find()
      .populate("userId", "name email mobileNumber uniqueCode")
      .sort({ balance: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalWallets / limit);

    res.status(200).json({
      success: true,
      wallets,
      currentPage: page,
      totalPages,
      totalWallets,
      limit
    });
  } catch (error) {
    console.error("Error fetching wallets:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin category management routes
router.get("/categories", adminAuth, async (req, res) => {
  try {
    const Category = await import("../models/categoryModel.js").then(m => m.default);
    const categories = await Category.find({}).sort({ isDefault: -1, name: 1 }).lean();
    res.status(200).json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/categories/:id", adminAuth, async (req, res) => {
  try {
    const Category = await import("../models/categoryModel.js").then(m => m.default);
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    await Category.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
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

router.delete("/progress-updates/:id", adminAuth, async (req, res) => {
  try {
    const ProgressUpdate = await import("../models/progressUpdateModel.js").then(m => m.default);
    const update = await ProgressUpdate.findByIdAndDelete(req.params.id);
    
    if (!update) {
      return res.status(404).json({ success: false, message: "Progress update not found" });
    }
    
    res.status(200).json({ success: true, message: "Progress update deleted successfully" });
  } catch (error) {
    console.error("Error deleting progress update:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
