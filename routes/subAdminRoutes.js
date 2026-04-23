import express from "express";
import {
  subAdminLogin,
  createSubAdmin,
  getAllSubAdmins,
  updateSubAdmin,
  deleteSubAdmin,
  resetSubAdminPassword,
} from "../controllers/subAdminController.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { superAdminOnly } from "../middleware/subAdminPermission.js";

const router = express.Router();

// Public route - sub-admin login
router.post("/login", subAdminLogin);

// Protected routes - super admin only
router.post("/create", adminAuth, superAdminOnly, createSubAdmin);
router.get("/all", adminAuth, superAdminOnly, getAllSubAdmins);
router.put("/:id", adminAuth, superAdminOnly, updateSubAdmin);
router.delete("/:id", adminAuth, superAdminOnly, deleteSubAdmin);
router.put("/:id/reset-password", adminAuth, superAdminOnly, resetSubAdminPassword);

export default router;
