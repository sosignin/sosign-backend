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
router.route("/:id/like").put(protect, toggleCommentLike).post(protect, toggleCommentLike);
router.post("/:id/reply", protect, addReply);

// Reply routes
router.route("/:commentId/replies/:replyId/approve").put(protect, approveReply).post(protect, approveReply);
router.route("/:commentId/replies/:replyId/reject").delete(protect, rejectReply).post(protect, rejectReply);
router.route("/:commentId/replies/:replyId").put(protect, updateReply).delete(protect, deleteReply).post(protect, updateReply);

// Generic ID-based routes (MUST come last)
router.route("/:id")
  .put(protect, updateComment)
  .delete(protect, deleteComment)
  .post(protect, (req, res, next) => {
    const override = req.headers["x-http-method-override"] || req.body?._method || req.query?._method;
    if (override === "DELETE") {
      return deleteComment(req, res, next);
    }
    return updateComment(req, res, next);
  });

export default router;
