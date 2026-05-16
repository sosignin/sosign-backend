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
} from "../controllers/adminController.js";
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

// Get verified users (DigiLocker KYC)
router.get("/verified-users", adminAuth, getVerifiedUsers);

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

export default router;
