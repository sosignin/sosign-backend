import express from "express";
import {
  getFaqs,
  getFaqById,
  createFaq,
  updateFaq,
  deleteFaq,
} from "../controllers/faqController.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Public routes
router.get("/", getFaqs);
router.get("/:id", getFaqById);

// Admin-only routes
router.post("/", adminAuth, createFaq);
router.put("/:id", adminAuth, updateFaq);
router.delete("/:id", adminAuth, deleteFaq);

export default router;
