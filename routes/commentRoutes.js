import express from "express";
import {
  createComment,
  getCommentsByPetition,
  updateComment,
  deleteComment,
  toggleCommentLike,
  addReply,
  updateReply,
  deleteReply,
  getUserRecentComments,
  getUserCommentsPaginated,
  getUnapprovedComments,
  getPendingCommentsForPetition,
  approveComment,
  rejectComment,
  approveReply,
  rejectReply,
} from "../controllers/commentController.js";
import { protect, getOptionalUser } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Admin routes (specific path with /admin/)
router.get("/admin/unapproved", adminAuth, getUnapprovedComments);
router.route("/admin/:id/approve").put(adminAuth, approveComment).post(adminAuth, approveComment);
router.route("/admin/:id/reject").put(adminAuth, rejectComment).delete(adminAuth, rejectComment).post(adminAuth, rejectComment);

// Petition creator routes for managing comments - EXPLICIT ROUTE
router.get("/petition/:petitionId/pending", protect, getPendingCommentsForPetition);

// Public comment retrieval
router.get("/petition/:petitionId", getOptionalUser, getCommentsByPetition);

// User-specific routes
router.get("/user/recent", protect, getUserRecentComments);
router.get("/user/all", protect, getUserCommentsPaginated);

// Root comment route
router.post("/", protect, createComment);

// Comment approval/rejection routes
router.route("/:id/approve").put(protect, approveComment).post(protect, approveComment);
router.route("/:id/reject").put(protect, rejectComment).delete(protect, rejectComment).post(protect, rejectComment);
router.put("/:id/like", protect, toggleCommentLike);
router.post("/:id/reply", protect, addReply);

// Reply routes
router.put("/:commentId/replies/:replyId/approve", protect, approveReply);
router.delete("/:commentId/replies/:replyId/reject", protect, rejectReply);
router.put("/:commentId/replies/:replyId", protect, updateReply);
router.delete("/:commentId/replies/:replyId", protect, deleteReply);

// Generic ID-based routes (MUST come last)
router.put("/:id", protect, updateComment);
router.delete("/:id", protect, deleteComment);

export default router;
