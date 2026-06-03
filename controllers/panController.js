import asyncHandler from "express-async-handler";
import {
  isValidPanNumber,
  hashPanNumber,
  createPanVerificationToken,
} from "../utils/panVerificationUtils.js";
import { verifyPanWithPlanApi } from "../utils/planApiPan.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";

// @desc    Verify PAN Card and return verification token
// @route   POST /api/pan/verify
// @access  Private
const verifyPanCard = asyncHandler(async (req, res) => {
  const panInput = req.body?.panNumber;
  
  if (!panInput) {
    res.status(400);
    throw new Error("PAN number is required");
  }

  const panNumber = panInput.trim().toUpperCase();

  if (!isValidPanNumber(panNumber)) {
    res.status(400);
    throw new Error("Please enter a valid 10-digit PAN number");
  }

  // Check if user is already PAN verified
  const existingUser = await User.findById(req.user._id);
  if (existingUser?.panKyc?.status === "verified") {
    res.status(400);
    throw new Error("Your PAN Card is already verified");
  }

  // Check user's wallet balance
  const wallet = await Wallet.getOrCreateWallet(req.user._id);
  const PAN_VERIFICATION_COST = 2; // 2 points (₹10 equivalent)

  if (wallet.balance < PAN_VERIFICATION_COST) {
    res.status(400);
    throw new Error(`Insufficient wallet balance. PAN verification requires ${PAN_VERIFICATION_COST} Points.`);
  }

  let verifyResult;
  try {
    verifyResult = await verifyPanWithPlanApi(panNumber);
  } catch (error) {
    const message = error?.message || "Failed to verify PAN Card";

    if (/whitelist|ip address/i.test(message)) {
      res.status(403);
      throw new Error(
        `${message}. Please whitelist your server/public IP in the PlanAPI dashboard.`,
      );
    }

    res.status(502);
    throw new Error(message);
  }

  const { registeredName, fatherName, panType } = verifyResult;

  // Deduct from wallet on successful verification
  wallet.balance -= PAN_VERIFICATION_COST;
  wallet.transactions.push({
    type: "debit",
    amount: PAN_VERIFICATION_COST,
    description: `PAN verification charges for ${panNumber}`,
  });
  await wallet.save();

  // Update user's KYC fields
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.panKyc = {
    status: "verified",
    panNumber,
    registeredName: registeredName || "N/A",
    fatherName: fatherName || "",
    panType: panType || "",
    verifiedAt: new Date(),
  };

  await user.save();

  const panVerificationToken = createPanVerificationToken({
    userId: req.user._id.toString(),
    panNumber,
  });

  res.status(200).json({
    success: true,
    message: "PAN Card verified successfully",
    panVerificationToken,
    registeredName: registeredName || "N/A",
    fatherName: fatherName || "N/A",
    panType: panType || "N/A",
  });
});

export { verifyPanCard };
