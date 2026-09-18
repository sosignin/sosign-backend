import asyncHandler from "express-async-handler";
import VictoryRequest from "../models/victoryRequestModel.js";
import Petition from "../models/petitionModel.js";
import SuccessfulPetition from "../models/successfulPetitionModel.js";
import createAdminNotification from "../utils/adminNotifier.js";

// @desc    Create a victory request for a petition
// @route   POST /api/victory-requests
// @access  Private (User)
const createVictoryRequest = asyncHandler(async (req, res) => {
  const { petitionId, outcome, story } = req.body;

  if (!petitionId) {
    res.status(400);
    throw new Error("Petition ID is required");
  }

  // Check if petition exists
  const petition = await Petition.findById(petitionId);
  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if user is the petition owner
  if (petition.petitionStarter?.user?.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized - you can only request victory for your own petitions");
  }

  // Check if petition is already marked as victory
  if (petition.isVictory) {
    res.status(400);
    throw new Error("This petition has already been declared a victory");
  }

  // Check if there's already a pending victory request for this petition
  const existingPending = await VictoryRequest.findOne({
    petition: petitionId,
    status: "pending",
  });

  if (existingPending) {
    res.status(400);
    throw new Error("A victory request for this petition is already pending review");
  }

  // Create the victory request
  const victoryRequest = await VictoryRequest.create({
    petition: petitionId,
    user: req.user._id,
    petitionTitle: petition.title,
    totalSignatures: petition.numberOfSignatures || 0,
    outcome: outcome?.trim() || "Goal achieved through community support",
    story: story?.trim() || "",
    status: "pending",
  });

  // Trigger Admin Notification
  createAdminNotification({
    category: "victory_request",
    title: "New Petition Victory Request 🏆",
    message: `${req.user?.name || "Petitioner"} requested victory approval for "${petition.title}"`,
    link: "/dashboard/victory-requests",
    relatedId: victoryRequest._id,
    meta: {
      petitionTitle: petition.title,
      creatorName: req.user?.name,
      totalSignatures: petition.numberOfSignatures || 0,
      outcome: victoryRequest.outcome,
    },
  });

  res.status(201).json({
    success: true,
    message: "Victory request submitted successfully. Awaiting admin approval.",
    victoryRequest,
  });
});

// @desc    Get all victory requests (for admin)
// @route   GET /api/victory-requests
// @access  Private (Admin)
const getVictoryRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status;

  const query = {};
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    query.status = status;
  }

  const victoryRequests = await VictoryRequest.find(query)
    .populate("petition", "title slug country numberOfSignatures categories petitionDetails")
    .populate("user", "name email mobile")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const total = await VictoryRequest.countDocuments(query);

  res.status(200).json({
    success: true,
    victoryRequests,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
      totalResults: total,
    },
  });
});

// @desc    Check victory request status for a petition
// @route   GET /api/victory-requests/check/:petitionId
// @access  Private (User)
const checkVictoryRequestStatus = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;

  const petition = await Petition.findById(petitionId);
  const victoryRequest = await VictoryRequest.findOne({
    petition: petitionId,
    user: req.user._id,
  }).sort({ createdAt: -1 });

  if (petition?.isVictory || (victoryRequest && victoryRequest.status === "approved")) {
    res.status(200).json({
      hasRequest: true,
      status: "approved",
      outcome: victoryRequest?.outcome || "Goal achieved through community support",
      adminNote: victoryRequest?.adminNote || "",
      reviewedAt: victoryRequest?.reviewedAt || petition?.victoryDeclaredAt,
    });
    return;
  }

  if (victoryRequest) {
    res.status(200).json({
      hasRequest: true,
      status: victoryRequest.status,
      outcome: victoryRequest.outcome,
      story: victoryRequest.story,
      adminNote: victoryRequest.adminNote,
      createdAt: victoryRequest.createdAt,
      reviewedAt: victoryRequest.reviewedAt,
    });
  } else {
    res.status(200).json({
      hasRequest: false,
      status: "none",
    });
  }
});

// @desc    Approve a victory request
// @route   PUT /api/victory-requests/:id/approve
// @access  Private (Admin)
const approveVictoryRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { adminNote, outcome } = req.body;

  const victoryRequest = await VictoryRequest.findById(id);
  if (!victoryRequest) {
    res.status(404);
    throw new Error("Victory request not found");
  }

  if (victoryRequest.status !== "pending") {
    res.status(400);
    throw new Error("This victory request has already been processed");
  }

  const petition = await Petition.findById(victoryRequest.petition);
  if (!petition) {
    res.status(404);
    throw new Error("Associated petition not found");
  }

  // Format decision makers for SuccessfulPetition model
  const formattedDecisionMakers = petition.decisionMakers?.length > 0
    ? petition.decisionMakers.map((dm) => ({
        name: dm.name || "Decision Maker",
        email: dm.email || "contact@sosign.in",
        organization: dm.organization || "",
        phone: dm.phone || "",
      }))
    : [{ name: "General Decision Makers", email: "contact@sosign.in", organization: "", phone: "" }];

  // Standard category check against enum
  const validCategories = [
    'Environment', 'Education', 'Healthcare', 'Social Justice',
    'Politics', 'Animal Rights', 'Human Rights', 'Technology', 'Other'
  ];
  const matchedCategory = validCategories.find(
    (c) => c.toLowerCase() === (petition.categories?.[0] || "").toLowerCase()
  ) || "Other";

  // Create or update record in SuccessfulPetition collection
  let successfulPetition = await SuccessfulPetition.findOne({ originalPetitionId: petition._id });
  if (!successfulPetition) {
    successfulPetition = await SuccessfulPetition.create({
      petitionTitle: petition.title || victoryRequest.petitionTitle,
      totalSignatures: Math.max(petition.numberOfSignatures || 0, victoryRequest.totalSignatures || 0, 1),
      decisionMakers: formattedDecisionMakers,
      issue: petition.petitionDetails?.problem || "Community goal achieved successfully.",
      location: petition.country || "India",
      petitionStarterName: petition.petitionStarter?.name || "Community Member",
      startedDate: petition.createdAt || new Date(),
      image: petition.petitionDetails?.image || (petition.petitionDetails?.images?.[0] || ""),
      originalPetitionId: petition._id,
      outcome: outcome || victoryRequest.outcome || "Goal achieved through community support",
      category: matchedCategory,
    });
  }

  // Update the original petition to victory status
  petition.isVictory = true;
  petition.status = "victory";
  petition.victoryDeclaredAt = new Date();
  await petition.save();

  // Update the victory request
  victoryRequest.status = "approved";
  victoryRequest.adminNote = adminNote || "";
  victoryRequest.reviewedBy = req.admin?.username || "admin";
  victoryRequest.reviewedAt = new Date();
  if (outcome) victoryRequest.outcome = outcome;
  await victoryRequest.save();

  res.status(200).json({
    success: true,
    message: "Victory request approved. Petition marked as successful and added to victory stories!",
    victoryRequest,
    successfulPetition,
  });
});

// @desc    Reject a victory request
// @route   PUT /api/victory-requests/:id/reject
// @access  Private (Admin)
const rejectVictoryRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { adminNote } = req.body;

  const victoryRequest = await VictoryRequest.findById(id);
  if (!victoryRequest) {
    res.status(404);
    throw new Error("Victory request not found");
  }

  if (victoryRequest.status !== "pending") {
    res.status(400);
    throw new Error("This victory request has already been processed");
  }

  victoryRequest.status = "rejected";
  victoryRequest.adminNote = adminNote || "";
  victoryRequest.reviewedBy = req.admin?.username || "admin";
  victoryRequest.reviewedAt = new Date();
  await victoryRequest.save();

  res.status(200).json({
    success: true,
    message: "Victory request rejected.",
    victoryRequest,
  });
});

// @desc    Get victory request statistics (for admin)
// @route   GET /api/victory-requests/stats
// @access  Private (Admin)
const getVictoryRequestStats = asyncHandler(async (req, res) => {
  const [total, pending, approved, rejected] = await Promise.all([
    VictoryRequest.countDocuments(),
    VictoryRequest.countDocuments({ status: "pending" }),
    VictoryRequest.countDocuments({ status: "approved" }),
    VictoryRequest.countDocuments({ status: "rejected" }),
  ]);

  res.status(200).json({
    success: true,
    stats: {
      total,
      pending,
      approved,
      rejected,
    },
  });
});

export {
  createVictoryRequest,
  getVictoryRequests,
  checkVictoryRequestStatus,
  approveVictoryRequest,
  rejectVictoryRequest,
  getVictoryRequestStats,
};
