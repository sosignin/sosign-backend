import asyncHandler from "express-async-handler";
import Comment from "../models/commentModel.js";
import Petition from "../models/petitionModel.js";
import { checkAbusiveContent } from "../utils/abusiveWords.js";

// @desc    Create a new comment
// @route   POST /api/comments
// @access  Private
const createComment = asyncHandler(async (req, res) => {
  const { petitionId, content } = req.body;

  // Validate required fields
  if (!petitionId || !content) {
    res.status(400);
    throw new Error("Please provide petition ID and comment content");
  }

  // Check for abusive content
  const abusiveCheck = checkAbusiveContent(content);
  if (abusiveCheck.hasAbusive) {
    res.status(400);
    throw new Error(abusiveCheck.warning);
  }

  // Check if petition exists
  const petition = await Petition.findById(petitionId);
  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Create comment
  const comment = await Comment.create({
    petition: petitionId,
    user: req.user._id,
    content: content.trim(),
  });

  // Populate user details for response
  await comment.populate("user", "name email designation");

  res.status(201).json({
    success: true,
    message: "Comment created successfully",
    comment,
  });
});

// @desc    Get all comments for a petition
// @route   GET /api/comments/petition/:petitionId
// @access  Public
const getCommentsByPetition = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Check if petition exists
  const petition = await Petition.findById(petitionId);
  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Query criteria: petition ID and (isApproved OR is author)
  const query = { petition: petitionId };
  if (req.user) {
    query.$or = [{ isApproved: true }, { user: req.user._id }];
  } else {
    query.isApproved = true;
  }

  // Get comments with pagination
  const comments = await Comment.find(query)
    .populate("user", "name email designation")
    .populate("likes.user", "name")
    .populate("replies.user", "name email designation")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Enhance comments with status flags for the frontend
  const userId = req.user ? req.user._id.toString() : null;
  comments.forEach((comment) => {
    // Check if current user is the author of the parent comment
    const commentAuthorId = comment.user?._id ? comment.user._id.toString() : comment.user?.toString();
    comment.isAuthor = !!(userId && commentAuthorId === userId);
    comment.isPending = !comment.isApproved;

    // Filter replies and add flags
    if (comment.replies) {
      comment.replies = comment.replies.filter((reply) => {
        const isApproved = reply.isApproved === true;
        const replyAuthorId = reply.user?._id ? reply.user._id.toString() : reply.user?.toString();
        const isAuthor = !!(userId && replyAuthorId === userId);
        
        // Add flags to reply object
        reply.isAuthor = isAuthor;
        reply.isPending = !isApproved;

        return isApproved || isAuthor;
      });
    }
  });

  const totalComments = await Comment.countDocuments(query);

  res.status(200).json({
    success: true,
    comments,
    currentPage: page,
    totalPages: Math.ceil(totalComments / limit),
    totalComments,
    hasNextPage: page < Math.ceil(totalComments / limit),
    hasPrevPage: page > 1,
  });
});

// @desc    Update a comment
// @route   PUT /api/comments/:id
// @access  Private (Only comment author)
const updateComment = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content) {
    res.status(400);
    throw new Error("Please provide comment content");
  }

  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  // Check if user is the comment author
  if (!req.user || comment.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to update this comment");
  }

  // Update comment
  comment.content = content.trim();
  comment.isEdited = true;
  comment.editedAt = new Date();

  const updatedComment = await comment.save();

  // Populate user details for response
  await updatedComment.populate("user", "name email designation");

  res.status(200).json({
    success: true,
    message: "Comment updated successfully",
    comment: updatedComment,
  });
});

// @desc    Delete a comment
// @route   DELETE /api/comments/:id
// @access  Private (Only comment author or admin)
const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  // Check if user is the comment author or admin
  const isAdmin = req.admin; // Admin requests have req.admin set by adminAuth middleware
  const isAuthor = req.user && comment.user.toString() === req.user._id.toString();

  if (!isAdmin && !isAuthor) {
    res.status(403);
    throw new Error("Not authorized to delete this comment");
  }

  await Comment.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: "Comment deleted successfully",
  });
});

// @desc    Like/Unlike a comment
// @route   PUT /api/comments/:id/like
// @access  Private
const toggleCommentLike = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  const userId = req.user._id.toString();
  const existingLikeIndex = comment.likes.findIndex(
    (like) => like.user.toString() === userId
  );

  if (existingLikeIndex > -1) {
    // Unlike the comment
    comment.likes.splice(existingLikeIndex, 1);
  } else {
    // Like the comment
    comment.likes.push({
      user: req.user._id,
      likedAt: new Date(),
    });
  }

  await comment.save();

  res.status(200).json({
    success: true,
    message: existingLikeIndex > -1 ? "Comment unliked" : "Comment liked",
    likesCount: comment.likes.length,
    isLiked: existingLikeIndex === -1,
  });
});

// @desc    Add a reply to a comment
// @route   POST /api/comments/:id/reply
// @access  Private
const addReply = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content) {
    res.status(400);
    throw new Error("Please provide reply content");
  }

  // Check for abusive content
  const abusiveCheck = checkAbusiveContent(content);
  if (abusiveCheck.hasAbusive) {
    res.status(400);
    throw new Error(abusiveCheck.warning);
  }

  const comment = await Comment.findById(req.params.id);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  // Only the petition creator (petitioner) can reply to comments
  const petition = await Petition.findById(comment.petition);
  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  const petitionStarterId = petition.petitionStarter?.user?.toString();
  if (!petitionStarterId || petitionStarterId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the petition creator can reply to comments");
  }

  // Add reply with isApproved: false (needs admin approval)
  const reply = {
    user: req.user._id,
    content: content.trim(),
    createdAt: new Date(),
    isApproved: false,
  };

  comment.replies.push(reply);
  await comment.save();

  // Populate the new reply with user details
  const populatedComment = await Comment.findById(req.params.id)
    .populate("user", "name email designation")
    .populate("replies.user", "name email designation");

  const newReply = populatedComment.replies[populatedComment.replies.length - 1];

  res.status(201).json({
    success: true,
    message: "Reply submitted for approval",
    reply: newReply,
  });
});

// @desc    Update a reply
// @route   PUT /api/comments/:commentId/replies/:replyId
// @access  Private (Only reply author)
const updateReply = asyncHandler(async (req, res) => {
  const { commentId, replyId } = req.params;
  const { content } = req.body;

  if (!content) {
    res.status(400);
    throw new Error("Please provide reply content");
  }

  // Check for abusive content
  const abusiveCheck = checkAbusiveContent(content);
  if (abusiveCheck.hasAbusive) {
    res.status(400);
    throw new Error(abusiveCheck.warning);
  }

  const comment = await Comment.findById(commentId);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  const reply = comment.replies.id(replyId);

  if (!reply) {
    res.status(404);
    throw new Error("Reply not found");
  }

  // Check if user is the reply author
  if (!req.user || reply.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to update this reply");
  }

  // Update reply
  reply.content = content.trim();
  reply.isEdited = true;
  reply.editedAt = new Date();

  await comment.save();

  res.status(200).json({
    success: true,
    message: "Reply updated successfully",
    reply,
  });
});

// @desc    Delete a reply
// @route   DELETE /api/comments/:commentId/replies/:replyId
// @access  Private (Only reply author or admin)
const deleteReply = asyncHandler(async (req, res) => {
  const { commentId, replyId } = req.params;

  const comment = await Comment.findById(commentId);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  const reply = comment.replies.id(replyId);

  if (!reply) {
    res.status(404);
    throw new Error("Reply not found");
  }

  // Check if user is the reply author or admin
  const isAdmin = req.admin; // Admin requests have req.admin set by adminAuth middleware
  const isAuthor = req.user && reply.user.toString() === req.user._id.toString();

  if (!isAdmin && !isAuthor) {
    res.status(403);
    throw new Error("Not authorized to delete this reply");
  }

  reply.remove();
  await comment.save();

  res.status(200).json({
    success: true,
    message: "Reply deleted successfully",
  });
});

// @desc    Get recent comments by logged-in user
// @route   GET /api/comments/user/recent
// @access  Private
const getUserRecentComments = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 4;

  // Get user's recent APPROVED comments only
  const comments = await Comment.find({
    user: req.user._id,
    isApproved: true  // Only show approved comments
  })
    .populate("petition", "title _id")
    .sort({ createdAt: -1 })
    .limit(limit);

  // Format the response to include petition info
  const formattedComments = comments.map((comment) => ({
    _id: comment._id,
    content: comment.content,
    createdAt: comment.createdAt,
    petitionId: comment.petition?._id,
    petitionTitle: comment.petition?.title,
    isApproved: comment.isApproved,
  }));

  res.status(200).json({
    success: true,
    comments: formattedComments,
  });
});

// @desc    Get all comments by logged-in user with pagination
// @route   GET /api/comments/user/all
// @access  Private
const getUserCommentsPaginated = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Get user's APPROVED comments only with pagination
  const comments = await Comment.find({
    user: req.user._id,
    isApproved: true,
  })
    .populate("petition", "title _id")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalComments = await Comment.countDocuments({
    user: req.user._id,
    isApproved: true,
  });

  // Format the response to include petition info
  const formattedComments = comments.map((comment) => ({
    _id: comment._id,
    content: comment.content,
    createdAt: comment.createdAt,
    petitionId: comment.petition?._id,
    petitionTitle: comment.petition?.title,
    isApproved: comment.isApproved,
  }));

  res.status(200).json({
    success: true,
    comments: formattedComments,
    currentPage: page,
    totalPages: Math.ceil(totalComments / limit),
    totalComments,
    hasNextPage: page < Math.ceil(totalComments / limit),
    hasPrevPage: page > 1,
  });
});

// @desc    Get all unapproved comments and replies (Admin only)
// @route   GET /api/admin/comments/unapproved
// @access  Admin
const getUnapprovedComments = asyncHandler(async (req, res) => {
  // Find comments that are unapproved OR have unapproved replies
  const comments = await Comment.find({
    $or: [{ isApproved: false }, { "replies.isApproved": false }],
  })
    .populate("user", "name email designation")
    .populate("petition") // Populate full petition to get details needed by admin UI
    .populate("replies.user", "name email designation")
    .sort({ createdAt: -1 });

  // Flatten unapproved comments and replies for the admin UI
  const unapprovedItems = [];
  comments.forEach((comment) => {
    // If the parent comment is unapproved, add it
    if (!comment.isApproved) {
      unapprovedItems.push(comment);
    }

    // Add any unapproved replies as individual items
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.forEach((reply) => {
        if (!reply.isApproved) {
          unapprovedItems.push({
            _id: `reply-${comment._id}-${reply._id}`, // Special ID format for replies
            content: `[REPLY] ${reply.content}`,
            user: reply.user,
            createdAt: reply.createdAt,
            petition: comment.petition,
            isReply: true,
            parentCommentId: comment._id,
            replyId: reply._id,
          });
        }
      });
    }
  });

  // Sort by date (newest first)
  unapprovedItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.status(200).json({
    success: true,
    comments: unapprovedItems,
  });
});

// @desc    Get pending comments for a specific petition (Petition creator only)
// @route   GET /api/comments/petition/:petitionId/pending
// @access  Private (Petition creator)
const getPendingCommentsForPetition = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;
  
  console.log(`[getPendingCommentsForPetition] Called with petitionId: ${petitionId}`);

  // Check if petition exists and user is the creator
  const petition = await Petition.findById(petitionId);

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  const isCreator = petition.petitionStarter.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

  console.log(`[getPendingCommentsForPetition] isCreator: ${isCreator}, isAdmin: ${isAdmin}`);

  if (!isCreator && !isAdmin) {
    res.status(403);
    throw new Error("Not authorized to view pending comments for this petition");
  }

  // Get all unapproved comments and replies for this petition
  const comments = await Comment.find({
    petition: petitionId,
    $or: [{ isApproved: false }, { "replies.isApproved": false }],
  })
    .populate("user", "name email designation")
    .populate("replies.user", "name email designation")
    .sort({ createdAt: -1 });

  console.log(`[getPendingCommentsForPetition] Found ${comments.length} pending items`);

  // Flatten unapproved comments and replies
  const pendingItems = [];
  comments.forEach((comment) => {
    // If the parent comment is unapproved, add it
    if (!comment.isApproved) {
      pendingItems.push({
        _id: comment._id,
        text: comment.content,
        userName: comment.user?.name || "Anonymous",
        createdAt: comment.createdAt,
        user: comment.user,
        content: comment.content,
        isApproved: comment.isApproved,
        replies: (comment.replies || [])
          .filter(reply => reply.isApproved)
          .map(reply => ({
            _id: reply._id,
            text: reply.content,
            userName: reply.user?.name || "Anonymous",
            createdAt: reply.createdAt,
          })),
      });
    }

    // Add any unapproved replies as individual items
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.forEach((reply) => {
        if (!reply.isApproved) {
          pendingItems.push({
            _id: `reply-${comment._id}-${reply._id}`, // Special ID format for replies
            text: reply.content,
            userName: reply.user?.name || "Anonymous",
            createdAt: reply.createdAt,
            petition: petitionId,
            isReply: true,
            parentCommentId: comment._id,
            replyId: reply._id,
          });
        }
      });
    }
  });

  res.status(200).json({
    success: true,
    petitionTitle: petition.title,
    pendingComments: pendingItems,
    count: pendingItems.length,
  });
});

// @desc    Approve a reply (Admin only)
// @route   PUT /api/admin/comments/:commentId/replies/:replyId/approve
// @access  Admin
const approveReply = asyncHandler(async (req, res) => {
  const { commentId, replyId } = req.params;

  const comment = await Comment.findById(commentId);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  const reply = comment.replies.id(replyId);

  if (!reply) {
    res.status(404);
    throw new Error("Reply not found");
  }

  reply.isApproved = true;
  reply.approvedAt = new Date();
  reply.approvedBy = req.admin?.username || "admin";

  await comment.save();

  res.status(200).json({
    success: true,
    message: "Reply approved successfully",
  });
});

// @desc    Reject/Delete a reply (Admin only)
// @route   DELETE /api/admin/comments/:commentId/replies/:replyId/reject
// @access  Admin
const rejectReply = asyncHandler(async (req, res) => {
  const { commentId, replyId } = req.params;

  const comment = await Comment.findById(commentId);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  const reply = comment.replies.id(replyId);

  if (!reply) {
    res.status(404);
    throw new Error("Reply not found");
  }

  reply.remove();
  await comment.save();

  res.status(200).json({
    success: true,
    message: "Reply rejected and deleted successfully",
  });
});

// @desc    Approve a comment (Admin only)
// @route   PUT /api/admin/comments/:id/approve
// @access  Admin
const approveComment = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const isAdminAuth = !!req.admin;

  // Handle reply approval if ID matches our special format
  if (id.startsWith("reply-")) {
    const parts = id.split("-");
    const commentId = parts[1];
    const replyId = parts[2];

    const comment = await Comment.findById(commentId);
    if (!comment) {
      res.status(404);
      throw new Error("Comment not found");
    }

    const reply = comment.replies.id(replyId);
    if (!reply) {
      res.status(404);
      throw new Error("Reply not found");
    }

    // Check authorization: admin auth or petition creator
    if (!isAdminAuth) {
      const petition = await Petition.findById(comment.petition);
      const isCreator = petition && req.user && petition.petitionStarter.user.toString() === req.user._id.toString();
      const isUserAdmin = req.user && (req.user.role === "admin" || req.user.role === "superadmin");

      if (!isCreator && !isUserAdmin) {
        res.status(403);
        throw new Error("Not authorized to approve this reply");
      }
    }

    reply.isApproved = true;
    reply.approvedAt = new Date();
    reply.approvedBy = isAdminAuth ? (req.admin.username || "admin") : (req.user.name || "user");

    await comment.save();

    return res.status(200).json({
      success: true,
      message: "Reply approved successfully",
    });
  }

  // Standard comment approval
  const comment = await Comment.findById(id);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  // Check authorization: admin auth or petition creator
  if (!isAdminAuth) {
    const petition = await Petition.findById(comment.petition);
    const isCreator = petition && req.user && petition.petitionStarter.user.toString() === req.user._id.toString();
    const isUserAdmin = req.user && (req.user.role === "admin" || req.user.role === "superadmin");

    if (!isCreator && !isUserAdmin) {
      res.status(403);
      throw new Error("Not authorized to approve this comment");
    }
  }

  comment.isApproved = true;
  comment.approvedAt = new Date();
  comment.approvedBy = isAdminAuth ? (req.admin.username || "admin") : (req.user.name || "user");

  await comment.save();

  res.status(200).json({
    success: true,
    message: "Comment approved successfully",
  });
});

// @desc    Reject/Delete a comment (Admin or Petition Creator)
// @route   DELETE /api/admin/comments/:id/reject
// @access  Admin or Petition Creator
const rejectComment = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const isAdminAuth = !!req.admin;

  // Handle reply rejection if ID matches our special format
  if (id.startsWith("reply-")) {
    const parts = id.split("-");
    const commentId = parts[1];
    const replyId = parts[2];

    const comment = await Comment.findById(commentId);
    if (!comment) {
      res.status(404);
      throw new Error("Comment not found");
    }

    const reply = comment.replies.id(replyId);
    if (!reply) {
      res.status(404);
      throw new Error("Reply not found");
    }

    // Check authorization: admin auth or petition creator
    if (!isAdminAuth) {
      const petition = await Petition.findById(comment.petition);
      const isCreator = petition && req.user && petition.petitionStarter.user.toString() === req.user._id.toString();
      const isUserAdmin = req.user && (req.user.role === "admin" || req.user.role === "superadmin");

      if (!isCreator && !isUserAdmin) {
        res.status(403);
        throw new Error("Not authorized to reject this reply");
      }
    }

    reply.remove();
    await comment.save();

    return res.status(200).json({
      success: true,
      message: "Reply rejected and deleted successfully",
    });
  }

  // Standard comment rejection
  const comment = await Comment.findById(id);

  if (!comment) {
    res.status(404);
    throw new Error("Comment not found");
  }

  // Check authorization: admin auth or petition creator
  if (!isAdminAuth) {
    const petition = await Petition.findById(comment.petition);
    const isCreator = petition && req.user && petition.petitionStarter.user.toString() === req.user._id.toString();
    const isUserAdmin = req.user && (req.user.role === "admin" || req.user.role === "superadmin");

    if (!isCreator && !isUserAdmin) {
      res.status(403);
      throw new Error("Not authorized to reject this comment");
    }
  }

  await Comment.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Comment rejected and deleted successfully",
  });
});

export {
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
};
