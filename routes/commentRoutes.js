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
  approveComment,
  rejectComment,
  approveReply,
  rejectReply,
} from "../controllers/commentController.js";
import { protect, getOptionalUser } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Comment routes
router.route("/").post(protect, createComment);
router.route("/user/recent").get(protect, getUserRecentComments);
router.route("/user/all").get(protect, getUserCommentsPaginated);
router.route("/petition/:petitionId").get(getOptionalUser, getCommentsByPetition);
router
  .route("/:id")
  .put(protect, updateComment)
  .delete(protect, deleteComment);
router.route("/:id/like").put(protect, toggleCommentLike);

// Reply routes
router.route("/:id/reply").post(protect, addReply);
router
  .route("/:commentId/replies/:replyId")
  .put(protect, updateReply)
  .delete(protect, deleteReply);

// Admin routes for comment approval
router.route("/admin/unapproved").get(adminAuth, getUnapprovedComments);
router.route("/admin/:id/approve").put(adminAuth, approveComment);
router.route("/admin/:id/reject").delete(adminAuth, rejectComment);
router.route("/admin/:commentId/replies/:replyId/approve").put(adminAuth, approveReply);
router.route("/admin/:commentId/replies/:replyId/reject").delete(adminAuth, rejectReply);

export default router;
