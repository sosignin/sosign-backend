import asyncHandler from "express-async-handler";
import DeletionRequest from "../models/deletionRequestModel.js";
import DeletedUserArchive from "../models/deletedUserArchiveModel.js";
import User from "../models/userModel.js";
import Petition from "../models/petitionModel.js";
import Comment from "../models/commentModel.js";
import Crowdfunding from "../models/crowdfundingModel.js";
import Wallet from "../models/walletModel.js";
import WalletRequest from "../models/walletRequestModel.js";
import Withdrawal from "../models/withdrawalModel.js";
import Notification from "../models/notificationModel.js";
import PetitionReport from "../models/petitionReportModel.js";
import StallReport from "../models/stallReportModel.js";
import createAdminNotification from "../utils/adminNotifier.js";

// @desc    Submit request to delete account and personal data (DPDP Act Sec 12)
// @route   POST /api/deletion-requests
// @access  Private (User)
export const createDeletionRequest = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Check if an existing pending request exists
  const existingPending = await DeletionRequest.findOne({
    user: user._id,
    status: "pending",
  });

  if (existingPending) {
    res.status(400);
    throw new Error("You already have an active pending deletion request under review.");
  }

  const { reason, customReason, feedback } = req.body;

  // Count user's petitions and signatures
  const petitionsCount = await Petition.countDocuments({
    $or: [
      { creator: user._id },
      { creatorId: user._id.toString() },
      ...(user.uniqueCode ? [{ creatorUniqueCode: user.uniqueCode }] : []),
    ],
  });

  const signaturesCount = await Petition.countDocuments({
    "signatures.user": user._id,
  });

  const deletionRequest = await DeletionRequest.create({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    userMobile: user.mobileNumber || "",
    reason: reason || "Privacy concerns & DPDP Act Right to Erasure",
    customReason: customReason || "",
    feedback: feedback || "",
    petitionsCount,
    signaturesCount,
    status: "pending",
  });

  // Send real-time notification to platform admins
  try {
    await createAdminNotification({
      category: "deletion_request",
      title: "Account & Data Deletion Request",
      message: `${user.name} (${user.email}) requested complete deletion of account and ${petitionsCount} petitions.`,
      link: "/dashboard/deletion-requests",
      relatedId: deletionRequest._id,
      meta: {
        userId: user._id,
        userEmail: user.email,
        petitionsCount,
        signaturesCount,
        reason: deletionRequest.reason,
      },
    });
  } catch (notifErr) {
    console.error("Failed to create admin notification for deletion request:", notifErr);
  }

  res.status(201).json({
    success: true,
    message: "Your account and data deletion request has been submitted successfully to administration.",
    request: deletionRequest,
  });
});

// @desc    Get user's latest deletion request
// @route   GET /api/deletion-requests/my
// @access  Private (User)
export const getMyDeletionRequest = asyncHandler(async (req, res) => {
  const request = await DeletionRequest.findOne({ user: req.user._id }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    request: request || null,
  });
});

// @desc    Cancel user's pending deletion request
// @route   PUT /api/deletion-requests/cancel
// @access  Private (User)
export const cancelDeletionRequest = asyncHandler(async (req, res) => {
  const request = await DeletionRequest.findOne({
    user: req.user._id,
    status: "pending",
  });

  if (!request) {
    res.status(404);
    throw new Error("No pending deletion request found to cancel.");
  }

  request.status = "cancelled";
  request.adminNote = "Cancelled by user";
  await request.save();

  res.status(200).json({
    success: true,
    message: "Your deletion request has been cancelled.",
    request,
  });
});

// @desc    Get all deletion requests for admin
// @route   GET /api/deletion-requests
// @access  Admin
export const getAdminDeletionRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const { status, search } = req.query;

  const query = {};
  if (status && status !== "all") {
    query.status = status;
  }

  if (search && search.trim()) {
    query.$or = [
      { userName: { $regex: search.trim(), $options: "i" } },
      { userEmail: { $regex: search.trim(), $options: "i" } },
      { reason: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const total = await DeletionRequest.countDocuments(query);
  const pendingCount = await DeletionRequest.countDocuments({ status: "pending" });
  const approvedCount = await DeletionRequest.countDocuments({ status: "approved" });
  const rejectedCount = await DeletionRequest.countDocuments({ status: "rejected" });

  const requests = await DeletionRequest.find(query)
    .populate("user", "name email mobileNumber profilePicture createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    requests,
    counts: {
      total,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    },
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    },
  });
});

// @desc    Approve deletion request: Permanently delete account, petitions & all personal data
// @route   PUT /api/deletion-requests/:id/approve
// @access  Admin
export const approveDeletionRequest = asyncHandler(async (req, res) => {
  const request = await DeletionRequest.findById(req.params.id);

  if (!request) {
    res.status(404);
    throw new Error("Deletion request not found");
  }

  if (request.status !== "pending") {
    res.status(400);
    throw new Error(`This request has already been ${request.status}`);
  }

  const userId = request.user;
  const user = await User.findById(userId);

  // --- Step 1: Capture complete snapshot for Legal Safety & Compliance Vault ---
  const userSnapshot = user
    ? {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        mobileNumber: user.mobileNumber || "",
        designation: user.designation || "",
        bio: user.bio || "",
        uniqueCode: user.uniqueCode || "",
        profilePicture: user.profilePicture || user.photoURL || "",
        aadhaarKyc: user.aadhaarKyc || null,
        isEmailVerified: user.isEmailVerified || false,
        isMobileVerified: user.isMobileVerified || false,
        createdAt: user.createdAt,
        followersCount: user.followers?.length || 0,
        followingCount: user.following?.length || 0,
      }
    : {
        id: userId.toString(),
        name: request.userName,
        email: request.userEmail,
        mobileNumber: request.userMobile || "",
      };

  // Find and snapshot all petitions created by this user before deletion
  const petitionFilter = {
    $or: [
      { creator: userId },
      { creatorId: userId.toString() },
      ...(user?.uniqueCode ? [{ creatorUniqueCode: user.uniqueCode }] : []),
    ],
  };

  const userPetitions = await Petition.find(petitionFilter).select(
    "title description category goal targetSignatures signatures status createdAt slug image"
  );

  const petitionsSnapshot = userPetitions.map((p) => ({
    id: p._id.toString(),
    title: p.title,
    description: p.description ? p.description.substring(0, 1500) : "",
    category: p.category,
    targetSignatures: p.targetSignatures || p.goal || 0,
    signaturesCount: p.signatures?.length || 0,
    status: p.status,
    createdAt: p.createdAt,
    slug: p.slug,
  }));

  // Find and snapshot crowdfunding
  const userCrowdfunding = await Crowdfunding.find({ creator: userId }).select(
    "title targetAmount raisedAmount status createdAt"
  );
  const crowdfundingSnapshot = userCrowdfunding.map((c) => ({
    id: c._id.toString(),
    title: c.title,
    targetAmount: c.targetAmount || 0,
    raisedAmount: c.raisedAmount || 0,
    status: c.status,
    createdAt: c.createdAt,
  }));

  // Find wallet & withdrawal summary
  const userWallet = await Wallet.findOne({ user: userId });
  const userWithdrawals = await Withdrawal.find({ user: userId }).select(
    "amount status upiId bankDetails createdAt"
  );
  const walletSummary = {
    balance: userWallet?.balance || 0,
    totalEarnings: userWallet?.totalEarnings || 0,
    withdrawalsCount: userWithdrawals.length,
    withdrawals: userWithdrawals.map((w) => ({
      amount: w.amount,
      status: w.status,
      createdAt: w.createdAt,
    })),
  };

  // Create permanent legal archive before deleting from active database
  const archive = await DeletedUserArchive.create({
    deletionRequestId: request._id,
    originalUserId: userId.toString(),
    userName: user?.name || request.userName,
    userEmail: user?.email || request.userEmail,
    userMobile: user?.mobileNumber || request.userMobile || "",
    uniqueCode: user?.uniqueCode || "",
    reason: request.reason,
    customReason: request.customReason || "",
    feedback: request.feedback || "",
    adminNote:
      req.body.adminNote ||
      "Account, petitions, and personal data permanently purged in compliance with DPDP Act 2023.",
    reviewedBy: req.admin?.email || req.admin?.name || "Administrator",
    requestedAt: request.createdAt,
    deletedAt: new Date(),
    userSnapshot,
    petitionsSnapshot,
    petitionsCount: petitionsSnapshot.length,
    signaturesCount: request.signaturesCount || 0,
    crowdfundingSnapshot,
    walletSummary,
    retentionLegalBasis:
      "Retained in Legal Vault under DPDP Act 2023 Sec 8(7)/8(8) and statutory audit obligations for platform defense and dispute resolution.",
  });

  // --- Step 2: Permanently delete user and data from all active public collections ---
  // 1. Permanently delete all petitions created by this user
  const deletedPetitionsResult = await Petition.deleteMany(petitionFilter);

  // 2. Permanently delete all comments posted by this user
  await Comment.deleteMany({ user: userId });

  // 3. Remove user signatures across all petitions
  await Petition.updateMany(
    { "signatures.user": userId },
    { $pull: { signatures: { user: userId } } }
  );

  // 4. Delete crowdfunding campaigns created by this user
  await Crowdfunding.deleteMany({ creator: userId });

  // 5. Delete user wallet and wallet requests
  await Wallet.deleteMany({ user: userId });
  await WalletRequest.deleteMany({ user: userId });

  // 6. Delete withdrawal requests
  await Withdrawal.deleteMany({ user: userId });

  // 7. Delete user notifications
  await Notification.deleteMany({ user: userId });

  // 8. Delete petition objection reports and stall reports submitted by user
  await PetitionReport.deleteMany({ reportedBy: userId });
  await StallReport.deleteMany({ reportedBy: userId });

  // 9. Remove user from followers / following of other users
  await User.updateMany({ followers: userId }, { $pull: { followers: userId } });
  await User.updateMany({ following: userId }, { $pull: { following: userId } });

  // 10. Permanently delete the User document itself
  if (user) {
    await User.findByIdAndDelete(userId);
  }

  // --- Step 3: Update deletion request record as approved with archive link ---
  request.status = "approved";
  request.adminNote =
    req.body.adminNote ||
    "Account, petitions, and personal data permanently purged in compliance with DPDP Act 2023.";
  request.reviewedBy = req.admin?.email || req.admin?.name || "Administrator";
  request.reviewedAt = new Date();
  request.deletedAt = new Date();
  request.archiveId = archive._id;
  request.archivedData = archive;
  await request.save();

  res.status(200).json({
    success: true,
    message: `Account, ${deletedPetitionsResult.deletedCount} petitions, and all personal data permanently deleted. Snapshot securely archived in Legal Vault.`,
    request,
    archiveId: archive._id,
  });
});

// @desc    Reject deletion request
// @route   PUT /api/deletion-requests/:id/reject
// @access  Admin
export const rejectDeletionRequest = asyncHandler(async (req, res) => {
  const request = await DeletionRequest.findById(req.params.id);

  if (!request) {
    res.status(404);
    throw new Error("Deletion request not found");
  }

  if (request.status !== "pending") {
    res.status(400);
    throw new Error(`This request has already been ${request.status}`);
  }

  request.status = "rejected";
  request.adminNote = req.body.adminNote || "Deletion request could not be fulfilled at this time.";
  request.reviewedBy = req.admin?.email || req.admin?.name || "Administrator";
  request.reviewedAt = new Date();
  await request.save();

  res.status(200).json({
    success: true,
    message: "Deletion request rejected.",
    request,
  });
});

// @desc    Get all archived deleted users (for legal safety & compliance)
// @route   GET /api/deletion-requests/archives
// @access  Admin
export const getDeletedUserArchives = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;
  const skip = (page - 1) * limit;
  const { search } = req.query;

  const query = {};
  if (search && search.trim()) {
    query.$or = [
      { userName: { $regex: search.trim(), $options: "i" } },
      { userEmail: { $regex: search.trim(), $options: "i" } },
      { userMobile: { $regex: search.trim(), $options: "i" } },
      { uniqueCode: { $regex: search.trim(), $options: "i" } },
      { "petitionsSnapshot.title": { $regex: search.trim(), $options: "i" } },
    ];
  }

  const total = await DeletedUserArchive.countDocuments(query);
  const archives = await DeletedUserArchive.find(query)
    .sort({ deletedAt: -1 })
    .skip(skip)
    .limit(limit);

  // Compute stats for safety overview
  const totalPetitionsArchived = await DeletedUserArchive.aggregate([
    { $group: { _id: null, total: { $sum: "$petitionsCount" } } },
  ]);

  res.status(200).json({
    success: true,
    archives,
    counts: {
      totalArchives: total,
      totalPetitionsArchived: totalPetitionsArchived[0]?.total || 0,
    },
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    },
  });
});

// @desc    Get single archived deleted user dossier
// @route   GET /api/deletion-requests/archives/:id
// @access  Admin
export const getDeletedUserArchiveById = asyncHandler(async (req, res) => {
  const archive = await DeletedUserArchive.findById(req.params.id);
  if (!archive) {
    res.status(404);
    throw new Error("Archived user record not found in Legal Vault");
  }

  res.status(200).json({
    success: true,
    archive,
  });
});
