import express from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import {
  getAdminNotifications,
  getAdminNotificationCounts,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications,
  syncPendingNotifications,
} from "../controllers/adminNotificationController.js";

const router = express.Router();

// All routes require admin authentication
router.use(adminAuth);

// Get counts and badge data for all 13 sidebar modules
router.get("/counts", getAdminNotificationCounts);

// Sync pending items from all collections into notifications feed
router.post("/sync-pending", syncPendingNotifications);

// Mark all as read
router.put("/mark-all-read", markAllNotificationsAsRead);

// Clear all read notifications
router.delete("/clear-all", clearAllNotifications);

// Get paginated notifications
router.get("/", getAdminNotifications);

// Single notification actions
router.put("/:id/read", markNotificationAsRead);
router.delete("/:id", deleteNotification);

export default router;
