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
router.route("/:id").put(adminAuth, updateFaq).delete(adminAuth, deleteFaq).post(adminAuth, (req, res, next) => {
  if (req.body?._action === "delete" || req.query?._action === "delete") {
    return deleteFaq(req, res, next);
  }
  return updateFaq(req, res, next);
});

export default router;
