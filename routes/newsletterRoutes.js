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
router.route("/admin/subscribers/:id").delete(adminAuth, deleteSubscriberAdmin).post(adminAuth, deleteSubscriberAdmin);
router.get("/admin/:id", adminAuth, getNewsletterByIdAdmin);
router.post("/", adminAuth, newsletterUpload.single("image"), createNewsletter);
router.route("/:id").put(adminAuth, newsletterUpload.single("image"), updateNewsletter).delete(adminAuth, deleteNewsletter).post(adminAuth, (req, res, next) => {
  if (req.body?._action === "delete" || req.query?._action === "delete") {
    return deleteNewsletter(req, res, next);
  }
  return newsletterUpload.single("image")(req, res, () => updateNewsletter(req, res, next));
});
router.route("/:id/publish").patch(adminAuth, togglePublished).put(adminAuth, togglePublished).post(adminAuth, togglePublished);

// Public route for single newsletter issue by slug (must be last)
router.get("/:slug", getNewsletterBySlug);

export default router;
