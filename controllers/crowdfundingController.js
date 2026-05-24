import Crowdfunding from "../models/crowdfundingModel.js";
import Withdrawal from "../models/withdrawalModel.js";
import asyncHandler from "express-async-handler";
import {
  normalizeAadhaarNumber,
  isValidAadhaarNumber,
  maskAadhaarNumber,
  hashAadhaarNumber,
  verifyAadhaarVerificationToken,
} from "../utils/aadhaarVerificationUtils.js";
import {
  isValidPanNumber,
  hashPanNumber,
  verifyPanVerificationToken,
} from "../utils/panVerificationUtils.js";

// @desc    Create a new crowdfunding campaign
// @route   POST /api/crowdfunding
// @access  Private
const createCampaign = asyncHandler(async (req, res) => {
  const {
    title,
    category,
    story,
    goalAmount,
    deadline,
    location,
    beneficiaryName,
    organizerPhone,
    hospitalName,
    doctorName,
    accountHolderName,
    accountNumber,
    ifscCode,
    bankName,
    minDonation,
    suggestedAmounts,
    legalAccepted,
    infoVerifiedByUser,
    aadharNumber,
    aadhaarNumber,
    panNumber,
    aadhaarVerificationToken,
    aadharVerificationToken,
    panVerificationToken,
  } = req.body;

  const isAadhaarAlreadyVerified = req.user?.aadhaarKyc?.status === "verified";
  const isPanAlreadyVerified = req.user?.panKyc?.status === "verified";
  const normalizedAadhaar = normalizeAadhaarNumber(aadhaarNumber || aadharNumber || "");
  const normalizedPan = String(panNumber || "").trim().toUpperCase();
  let campaignAadhaar = req.user?.aadhaarKyc?.maskedAadhaar || "";
  let campaignPan = req.user?.panKyc?.panNumber || "";

  if (!isAadhaarAlreadyVerified) {
    if (!isValidAadhaarNumber(normalizedAadhaar)) {
      res.status(400);
      throw new Error("Please complete Aadhaar verification before creating a crowdfunding campaign");
    }

    const aadhaarToken = (aadhaarVerificationToken || aadharVerificationToken || "").trim();
    if (!aadhaarToken) {
      res.status(400);
      throw new Error("Aadhaar OTP verification is required before creating a crowdfunding campaign");
    }

    let decodedAadhaarToken;
    try {
      decodedAadhaarToken = verifyAadhaarVerificationToken(aadhaarToken);
    } catch (error) {
      res.status(401);
      throw new Error("Invalid or expired Aadhaar verification. Please verify again.");
    }

    if (decodedAadhaarToken.userId !== req.user._id.toString()) {
      res.status(403);
      throw new Error("Aadhaar verification token does not belong to this user");
    }

    if (decodedAadhaarToken.aadhaarHash !== hashAadhaarNumber(normalizedAadhaar)) {
      res.status(400);
      throw new Error("Verified Aadhaar does not match the Aadhaar number entered in the form");
    }

    campaignAadhaar = maskAadhaarNumber(normalizedAadhaar);
  }

  if (!isPanAlreadyVerified) {
    if (!isValidPanNumber(normalizedPan)) {
      res.status(400);
      throw new Error("Please provide a valid 10-digit PAN card number");
    }

    const panToken = (panVerificationToken || "").trim();
    if (!panToken) {
      res.status(400);
      throw new Error("PAN Card verification is required before creating a crowdfunding campaign");
    }

    let decodedPanToken;
    try {
      decodedPanToken = verifyPanVerificationToken(panToken);
    } catch (error) {
      res.status(401);
      throw new Error("Invalid or expired PAN verification. Please verify again.");
    }

    if (decodedPanToken.userId !== req.user._id.toString()) {
      res.status(403);
      throw new Error("PAN verification token does not belong to this user");
    }

    if (decodedPanToken.panHash !== hashPanNumber(normalizedPan)) {
      res.status(400);
      throw new Error("Verified PAN does not match the PAN number entered in the form");
    }

    campaignPan = normalizedPan;
  }

  // Extract file URLs from req.files
  const files = req.files || {};
  
  const getFilePath = (fieldName) => {
    return files[fieldName] ? files[fieldName][0].path : "";
  };

  const getMultipleFilePaths = (fieldName) => {
    return files[fieldName] ? files[fieldName].map(file => file.path) : [];
  };

  const campaignData = {
    title,
    category,
    story,
    goalAmount: Number(goalAmount),
    deadline: new Date(deadline),
    location,
    beneficiaryName,
    organizerPhone,
    isPhoneVerified: true, // Dummy verification as requested
    image: getFilePath("image"),
    identityVerification: {
      aadhaar: {
        status: "verified",
        maskedAadhaar: campaignAadhaar,
        verifiedAt: req.user?.aadhaarKyc?.verifiedAt || new Date(),
      },
      pan: {
        status: "verified",
        panNumber: campaignPan,
        verifiedAt: req.user?.panKyc?.verifiedAt || new Date(),
      },
    },
    medicalDetails: {
      hospitalName,
      doctorName,
      reports: getMultipleFilePaths("reports"),
    },
    bankDetails: {
      accountHolderName,
      accountNumber,
      ifscCode,
      bankName,
      cancelledCheque: getFilePath("cancelledCheque"),
    },
    settings: {
      minDonation: Number(minDonation || 100),
      suggestedAmounts: suggestedAmounts ? JSON.parse(suggestedAmounts) : [100, 500, 1000],
    },
    legalAccepted: legalAccepted === "true",
    infoVerifiedByUser: infoVerifiedByUser === "true",
    creator: req.user._id,
    approved: false, // Must be approved by admin before appearing on frontend
  };

  const campaign = await Crowdfunding.create(campaignData);
  res.status(201).json(campaign);
});

// @desc    Get all campaigns
// @route   GET /api/crowdfunding
// @access  Public
const getCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await Crowdfunding.find({ approved: true }).sort({ createdAt: -1 });
  res.json(campaigns);
});

// @desc    Get campaign by ID or Slug
// @route   GET /api/crowdfunding/:id
// @access  Public
const getCampaignById = asyncHandler(async (req, res) => {
  const campaign = await Crowdfunding.findOne({
    $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }, { slug: req.params.id }],
  }).populate("creator", "name email");

  if (!campaign) {
    res.status(404);
    throw new Error("Campaign not found");
  }

  res.json(campaign);
});

// @desc    Simulate a donation (Dummy flow)
// @route   POST /api/crowdfunding/:id/donate
// @access  Public
const dummyDonate = asyncHandler(async (req, res) => {
  const { amount, name } = req.body;
  const campaign = await Crowdfunding.findById(req.params.id);

  if (!campaign) {
    res.status(404);
    throw new Error("Campaign not found");
  }

  const donation = {
    user: req.user ? req.user._id : null,
    name: name || "Anonymous",
    amount: Number(amount),
    transactionId: `DUMMY-${Date.now()}`,
  };

  campaign.donations.push(donation);
  campaign.raisedAmount += Number(amount);
  campaign.donorsCount += 1;

  await campaign.save();

  res.status(200).json({
    success: true,
    message: "Donation successful (Simulated)",
    campaign: {
      raisedAmount: campaign.raisedAmount,
      donorsCount: campaign.donorsCount,
    },
  });
});

// @desc    Get user's own campaigns
// @route   GET /api/crowdfunding/my
// @access  Private
const getMyCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await Crowdfunding.find({ creator: req.user._id }).sort({ createdAt: -1 });
  
  // For each campaign, calculate withdrawn and pending amounts dynamically
  const campaignsWithStats = await Promise.all(
    campaigns.map(async (campaign) => {
      const withdrawals = await Withdrawal.find({ campaign: campaign._id });
      
      const withdrawnAmount = withdrawals
        .filter((w) => w.status === "approved")
        .reduce((acc, w) => acc + w.amount, 0);
        
      const pendingAmount = withdrawals
        .filter((w) => w.status === "pending")
        .reduce((acc, w) => acc + w.amount, 0);

      // Return plain object with calculated fields
      return {
        ...campaign.toObject(),
        withdrawnAmount,
        pendingAmount,
        availableBalance: campaign.raisedAmount - withdrawnAmount - pendingAmount,
      };
    })
  );

  res.json(campaignsWithStats);
});

// @desc    Get all campaigns (Admin)
// @route   GET /api/crowdfunding/admin/all
// @access  Private/Admin
const adminGetAllCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await Crowdfunding.find({})
    .populate("creator", "name email")
    .sort({ createdAt: -1 });
  res.json(campaigns);
});

// @desc    Update campaign status (Admin)
// @route   PUT /api/crowdfunding/:id/status
// @access  Private/Admin
const adminUpdateCampaignStatus = asyncHandler(async (req, res) => {
  const { approved } = req.body;
  const campaign = await Crowdfunding.findById(req.params.id);

  if (!campaign) {
    res.status(404);
    throw new Error("Campaign not found");
  }

  campaign.approved = approved !== undefined ? approved : campaign.approved;
  const updatedCampaign = await campaign.save();
  res.json(updatedCampaign);
});

// @desc    Get Crowdfunding Dashboard Stats (Admin)
// @route   GET /api/crowdfunding/admin/stats
// @access  Private/Admin
const getCrowdfundingStats = asyncHandler(async (req, res) => {
  const totalCampaigns = await Crowdfunding.countDocuments();
  const activeCampaigns = await Crowdfunding.countDocuments({ approved: true });
  
  const allCampaigns = await Crowdfunding.find({});
  const totalRaised = allCampaigns.reduce((acc, c) => acc + (c.raisedAmount || 0), 0);
  const totalDonors = allCampaigns.reduce((acc, c) => acc + (c.donorsCount || 0), 0);

  res.json({
    totalCampaigns,
    activeCampaigns,
    totalRaised,
    totalDonors
  });
});

export { 
  createCampaign, 
  getCampaigns, 
  getCampaignById, 
  dummyDonate,
  getMyCampaigns,
  adminGetAllCampaigns,
  adminUpdateCampaignStatus,
  getCrowdfundingStats
};
