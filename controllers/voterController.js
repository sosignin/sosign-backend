import asyncHandler from "express-async-handler";
import {
  isValidVoterNumber,
  createVoterVerificationToken,
} from "../utils/voterVerificationUtils.js";
import { verifyVoterWithPlanApi } from "../utils/planApiVoter.js";
import User from "../models/userModel.js";

// @desc    Verify Voter ID and return verification token
// @route   POST /api/voter/verify
// @access  Private
const verifyVoterCard = asyncHandler(async (req, res) => {
  const voterInput = req.body?.voterNumber;
  
  if (!voterInput) {
    res.status(400);
    throw new Error("Voter ID number is required");
  }

  const voterId = voterInput.trim().toUpperCase();

  if (!isValidVoterNumber(voterId)) {
    res.status(400);
    throw new Error("Please enter a valid 10-18 character Voter ID");
  }

  // Check if user is already Voter verified
  const existingUser = await User.findById(req.user._id);
  if (existingUser?.voterKyc?.status === "verified") {
    res.status(400);
    throw new Error("Your Voter ID is already verified");
  }

  let verifyResult;
  try {
    verifyResult = await verifyVoterWithPlanApi(voterId);
  } catch (error) {
    const message = error?.message || "Failed to verify Voter ID";

    if (/whitelist|ip address/i.test(message)) {
      res.status(403);
      throw new Error(
        `${message}. Please whitelist your server/public IP in the PlanAPI dashboard.`,
      );
    }

    res.status(502);
    throw new Error(message);
  }

  const {
    epicNo,
    holderName,
    dob,
    gender,
    relation,
    relationType,
    area,
    district,
  } = verifyResult;

  // Update user's KYC fields
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.voterKyc = {
    status: "verified",
    voterId: epicNo || voterId,
    registeredName: holderName || "N/A",
    dob: dob || "",
    gender: gender || "",
    relation: relation || "",
    relationType: relationType || "",
    area: area || "",
    district: district || "",
    verifiedAt: new Date(),
  };

  await user.save();

  const voterVerificationToken = createVoterVerificationToken({
    userId: req.user._id.toString(),
    voterId: epicNo || voterId,
  });

  res.status(200).json({
    success: true,
    message: "Voter ID verified successfully",
    voterVerificationToken,
    registeredName: holderName || "N/A",
  });
});

export { verifyVoterCard };
