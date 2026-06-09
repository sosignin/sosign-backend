import asyncHandler from "express-async-handler";
import ProgressUpdate from "../models/progressUpdateModel.js";
import Petition from "../models/petitionModel.js";

// @desc    Create a progress update
// @route   POST /api/progress-updates/:petitionId
// @access  Private (Creator or Admin)
export const createProgressUpdate = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;
  const { title, content, updateType, videoUrl, milestoneLabel, milestoneStatus } = req.body;

  const petition = await Petition.findById(petitionId);

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if user is creator or admin
  const isCreator = petition.petitionStarter.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

  if (!isCreator && !isAdmin) {
    res.status(403);
    throw new Error("Not authorized to post progress updates for this petition");
  }

  const images = [];
  const documents = [];

  // Handle uploaded files
  if (req.files) {
    if (req.files.images) {
      req.files.images.forEach((file) => {
        images.push(file.path);
      });
    }
    if (req.files.documents) {
      req.files.documents.forEach((file) => {
        documents.push({
          url: file.path,
          filename: file.originalname,
          fileType: file.mimetype,
        });
      });
    }
  }

  const milestone = milestoneLabel
    ? { label: milestoneLabel, status: milestoneStatus || "completed" }
    : undefined;

  const update = new ProgressUpdate({
    petition: petitionId,
    author: req.user._id,
    title,
    content,
    updateType: updateType || "text",
    images,
    documents,
    videoUrl,
    milestone,
    isApproved: true, // Auto-publish for creators
  });

  const createdUpdate = await update.save();

  // Populate author details for the response
  await createdUpdate.populate("author", "name profilePicture role");

  res.status(201).json(createdUpdate);
});

// @desc    Get progress updates for a petition
// @route   GET /api/progress-updates/:petitionId
// @access  Public
export const getProgressUpdates = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;

  const updates = await ProgressUpdate.find({ petition: petitionId, isApproved: true })
    .sort({ createdAt: -1 })
    .populate("author", "name profilePicture role");

  res.json(updates);
});

// @desc    Delete a progress update
// @route   DELETE /api/progress-updates/:id
// @access  Private (Creator or Admin)
export const deleteProgressUpdate = asyncHandler(async (req, res) => {
  const update = await ProgressUpdate.findById(req.params.id);

  if (!update) {
    res.status(404);
    throw new Error("Progress update not found");
  }

  const isCreator = update.author.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

  if (!isCreator && !isAdmin) {
    res.status(403);
    throw new Error("Not authorized to delete this update");
  }

  await update.deleteOne();

  res.json({ message: "Progress update removed" });
});

// @desc    React to a progress update (toggle like)
// @route   PUT /api/progress-updates/:id/react
// @access  Private
export const reactToUpdate = asyncHandler(async (req, res) => {
  const update = await ProgressUpdate.findById(req.params.id);

  if (!update) {
    res.status(404);
    throw new Error("Progress update not found");
  }

  // Check if user has already reacted
  const existingReactionIndex = update.reactions.findIndex(
    (r) => r.user.toString() === req.user._id.toString()
  );

  if (existingReactionIndex >= 0) {
    // User already reacted, remove the reaction (toggle off)
    update.reactions.splice(existingReactionIndex, 1);
  } else {
    // User hasn't reacted, add reaction
    update.reactions.push({
      user: req.user._id,
      type: "like",
    });
  }

  await update.save();

  res.json(update.reactions);
});

// @desc    Update petition target signatures for progress display
// @route   PUT /api/progress-updates/:petitionId/progress
// @access  Private (Creator or Admin)
export const updateProgressPercentage = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;
  const { targetSignatures } = req.body;

  const petition = await Petition.findById(petitionId);

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  const isCreator = petition.petitionStarter.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

  if (!isCreator && !isAdmin) {
    res.status(403);
    throw new Error("Not authorized to update petition progress");
  }

  const nextTargetSignatures = Number(targetSignatures);

  if (!Number.isInteger(nextTargetSignatures) || nextTargetSignatures < 1) {
    res.status(400);
    throw new Error("Valid target signatures count is required");
  }

  petition.targetSignatures = nextTargetSignatures;
  petition.progressPercentage = Math.min(
    Math.floor(((petition.numberOfSignatures || 0) / nextTargetSignatures) * 100),
    100
  );
  await petition.save();

  res.json({
    targetSignatures: petition.targetSignatures,
    numberOfSignatures: petition.numberOfSignatures,
    progressPercentage: petition.progressPercentage,
  });
});
