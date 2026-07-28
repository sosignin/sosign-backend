import express from "express";
import {
  getNewsletters,
  getNewsletterBySlug,
  subscribe,
  unsubscribe,
  getAllNewslettersAdmin,
  getNewsletterByIdAdmin,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
  togglePublished,
  getSubscribersAdmin,
  deleteSubscriberAdmin,
} from "../controllers/newsletterController.js";
import { adminAuth } from "../middleware/adminAuth.js";
import newsletterUpload from "../middleware/newsletterUpload.js";

const router = express.Router();

// Public subscription endpoints
router.post("/subscribe", subscribe);
router.post("/unsubscribe", unsubscribe);

// Public newsletter endpoints
router.get("/", getNewsletters);

// Admin routes (must be specified before dynamic :slug param)
router.get("/admin/all", adminAuth, getAllNewslettersAdmin);
router.get("/admin/subscribers", adminAuth, getSubscribersAdmin);
router.delete("/admin/subscribers/:id", adminAuth, deleteSubscriberAdmin);
router.get("/admin/:id", adminAuth, getNewsletterByIdAdmin);
router.post("/", adminAuth, newsletterUpload.single("image"), createNewsletter);
router.put("/:id", adminAuth, newsletterUpload.single("image"), updateNewsletter);
router.delete("/:id", adminAuth, deleteNewsletter);
router.patch("/:id/publish", adminAuth, togglePublished);

// Public route for single newsletter issue by slug (must be last)
router.get("/:slug", getNewsletterBySlug);

export default router;
