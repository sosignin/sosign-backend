import Withdrawal from "../models/withdrawalModel.js";
import Crowdfunding from "../models/crowdfundingModel.js";
import asyncHandler from "express-async-handler";
import createAdminNotification from "../utils/adminNotifier.js";

// @desc    Create a withdrawal request
// @route   POST /api/withdrawals
// @access  Private
const createWithdrawalRequest = asyncHandler(async (req, res) => {
  const { campaignId, amount } = req.body;

  const campaign = await Crowdfunding.findById(campaignId);

  if (!campaign) {
    res.status(404);
    throw new Error("Campaign not found");
  }

  // Check if user is the owner
  if (campaign.creator.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error("Not authorized to request withdrawal for this campaign");
  }

  // Calculate available balance dynamically (Total Raised - Approved - Pending)
  const allWithdrawals = await Withdrawal.find({ campaign: campaignId });
  const totalSubtracted = allWithdrawals
    .filter(w => w.status === "approved" || w.status === "pending")
    .reduce((acc, w) => acc + w.amount, 0);

  const availableBalance = campaign.raisedAmount - totalSubtracted;

  if (availableBalance < amount) {
    res.status(400);
    throw new Error(`Insufficient funds. Available (after pending): ₹${availableBalance}`);
  }

  const withdrawal = await Withdrawal.create({
    campaign: campaignId,
    user: req.user._id,
    amount,
    bankDetails: campaign.bankDetails,
  });

  // Trigger Admin Notification
  createAdminNotification({
    category: "withdrawal_request",
    title: "New Withdrawal Request",
    message: `${req.user?.name || "Creator"} requested withdrawal of ₹${amount} for "${campaign.title}"`,
    link: "/dashboard/withdrawals",
    relatedId: withdrawal._id,
    meta: {
      amount,
      campaignTitle: campaign.title,
      userName: req.user?.name,
    },
  });

  res.status(201).json(withdrawal);
});

// @desc    Get my withdrawal requests
// @route   GET /api/withdrawals/my
// @access  Private
const getMyWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await Withdrawal.find({ user: req.user._id }).populate("campaign", "title");
  res.json(withdrawals);
});

// @desc    Get all withdrawal requests (Admin)
// @route   GET /api/withdrawals
// @access  Private/Admin
const getAllWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await Withdrawal.find({})
    .populate("user", "name email")
    .populate("campaign", "title raisedAmount")
    .sort({ createdAt: -1 });
  res.json(withdrawals);
});

// @desc    Update withdrawal status (Admin)
// @route   PUT /api/withdrawals/:id
// @access  Private/Admin
const updateWithdrawalStatus = asyncHandler(async (req, res) => {
  const { status, adminMessage } = req.body;
  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) {
    res.status(404);
    throw new Error("Withdrawal request not found");
  }

  withdrawal.status = status || withdrawal.status;
  withdrawal.adminMessage = adminMessage || withdrawal.adminMessage;

  const updatedWithdrawal = await withdrawal.save();

  res.json(updatedWithdrawal);
});

export {
  createWithdrawalRequest,
  getMyWithdrawals,
  getAllWithdrawals,
  updateWithdrawalStatus,
};
