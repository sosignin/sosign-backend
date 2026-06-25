import asyncHandler from "express-async-handler";
import {
  isValidPanNumber,
  hashPanNumber,
  createPanVerificationToken,
} from "../utils/panVerificationUtils.js";
import { verifyPanWithPlanApi } from "../utils/planApiPan.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import { calculateVerificationCost } from "../utils/billingUtils.js";

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

  // Check user's wallet balance / free checks
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  let panVerificationCost = 0;
  if (user.freeChecksRemaining === 0) {
    if (user.plan === "free" || user.plan === "none") {
      res.status(400);
      throw new Error("Free checks exhausted. Please purchase a credit plan to verify identity.");
    }

    panVerificationCost = await calculateVerificationCost(user, "pan");
    const wallet = await Wallet.getOrCreateWallet(user._id);
    if (wallet.balance < panVerificationCost) {
      res.status(400);
      throw new Error(`Insufficient wallet balance. PAN verification requires ${panVerificationCost} Points.`);
    }
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

  // Deduct from wallet/free checks on successful verification
  if (user.freeChecksRemaining > 0) {
    user.freeChecksRemaining -= 1;
    await user.save();
    const wallet = await Wallet.getOrCreateWallet(user._id);
    wallet.transactions.push({
      type: "debit",
      amount: 0,
      description: `Free Identity Check (Remaining: ${user.freeChecksRemaining})`,
    });
    await wallet.save();
  } else {
    const wallet = await Wallet.getOrCreateWallet(user._id);
    wallet.balance -= panVerificationCost;
    wallet.transactions.push({
      type: "debit",
      amount: panVerificationCost,
      description: `PAN verification charges for ${panNumber} (${panVerificationCost} Points)`,
    });
    await wallet.save();
  }

  // Update user's KYC fields
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
