import express from "express";
import {
  createContactMessage,
  getAllContactMessages,
  updateContactStatus,
  deleteContactMessage,
} from "../controllers/contactController.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Public route for form submission
router.post("/", createContactMessage);

// Admin routes
router.get("/admin/all", adminAuth, getAllContactMessages);
router.put("/admin/:id/status", adminAuth, updateContactStatus);
router.post("/admin/:id/status", adminAuth, updateContactStatus);
router.delete("/admin/:id", adminAuth, deleteContactMessage);
router.post("/admin/:id/delete", adminAuth, deleteContactMessage);

export default router;
