import asyncHandler from "express-async-handler";
import {
  normalizeAadhaarNumber,
  isValidAadhaarNumber,
  maskAadhaarNumber,
  hashAadhaarNumber,
  createAadhaarOtpSessionToken,
  verifyAadhaarOtpSessionToken,
  createAadhaarVerificationToken,
} from "../utils/aadhaarVerificationUtils.js";
import {
  sendAadhaarOtpWithPlanApi,
  verifyAadhaarOtpWithPlanApi,
} from "../utils/planApiAadhaar.js";
import { verifyAadhaarByImages } from "../utils/planApiAadhaarOcr.js";
import {
  initializeDigilockerSession,
  checkDigilockerStatus,
  downloadDigilockerAadhaar,
} from "../utils/planApiDigilocker.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import { calculateVerificationCost } from "../utils/billingUtils.js";

// @desc    Send Aadhaar OTP for verification
// @route   POST /api/aadhaar/send-otp
// @access  Private
const sendAadhaarOtp = asyncHandler(async (req, res) => {
  const aadhaarInput = req.body?.aadhaarNumber || req.body?.aadharNumber;
  const aadhaarNumber = normalizeAadhaarNumber(aadhaarInput);

  if (!isValidAadhaarNumber(aadhaarNumber)) {
    res.status(400);
    throw new Error("Please enter a valid 12-digit Aadhaar number");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (user.aadhaarKyc?.status === "verified") {
    res.status(400);
    throw new Error("Your Aadhaar is already verified");
  }

  // Check balance / free checks before calling external OTP API
  if (user.freeChecksRemaining === 0) {
    if (user.plan === "free" || user.plan === "none") {
      res.status(400);
      throw new Error("Free checks exhausted. Please purchase a credit plan to verify identity.");
    }

    const cost = await calculateVerificationCost(user, "aadhaar");
    const wallet = await Wallet.getOrCreateWallet(user._id);
    if (wallet.balance < cost) {
      res.status(400);
      throw new Error(`Insufficient wallet balance. Aadhaar verification requires ${cost} Points.`);
    }
  }

  let sendOtpResult;
  try {
    sendOtpResult = await sendAadhaarOtpWithPlanApi(aadhaarNumber);
  } catch (error) {
    const message = error?.message || "Failed to send Aadhaar OTP";

    if (/whitelist|ip address/i.test(message)) {
      res.status(403);
      throw new Error(
        `${message}. Please whitelist your server/public IP in the PlanAPI dashboard.`,
      );
    }

    res.status(502);
    throw new Error(message);
  }

  const { refId, message, testMode, apiMode } = sendOtpResult;

  const otpSessionToken = createAadhaarOtpSessionToken({
    userId: req.user._id.toString(),
    aadhaarNumber,
    refId,
  });

  res.status(200).json({
    success: true,
    message: message || "OTP has been sent to Aadhaar-registered mobile number",
    otpSessionToken,
    maskedAadhaar: maskAadhaarNumber(aadhaarNumber),
    testMode,
    apiMode,
  });
});

// @desc    Verify Aadhaar OTP and return verification token
// @route   POST /api/aadhaar/verify-otp
// @access  Private
const verifyAadhaarOtp = asyncHandler(async (req, res) => {
  const { otpSessionToken, otp } = req.body || {};
  const aadhaarInput = req.body?.aadhaarNumber || req.body?.aadharNumber;
  const aadhaarNumber = normalizeAadhaarNumber(aadhaarInput);

  if (!otpSessionToken) {
    res.status(400);
    throw new Error("OTP session token is required");
  }

  if (!isValidAadhaarNumber(aadhaarNumber)) {
    res.status(400);
    throw new Error("Please enter a valid 12-digit Aadhaar number");
  }

  const otpValue = String(otp || "").trim();
  if (!/^\d{4,8}$/.test(otpValue)) {
    res.status(400);
    throw new Error("Please enter a valid OTP");
  }

  let decodedSession;
  try {
    decodedSession = verifyAadhaarOtpSessionToken(otpSessionToken);
  } catch (error) {
    res.status(401);
    throw new Error("Invalid or expired OTP session. Please send OTP again.");
  }

  if (decodedSession.userId !== req.user._id.toString()) {
    res.status(403);
    throw new Error("OTP session does not belong to this user");
  }

  if (decodedSession.aadhaarHash !== hashAadhaarNumber(aadhaarNumber)) {
    res.status(400);
    throw new Error("Entered Aadhaar number does not match OTP session");
  }

  let verifyOtpResult;
  try {
    verifyOtpResult = await verifyAadhaarOtpWithPlanApi({
      aadhaarNumber,
      refId: decodedSession.refId,
      otp: otpValue,
    });
  } catch (error) {
    const message = error?.message || "Failed to verify Aadhaar OTP";

    if (/whitelist|ip address/i.test(message)) {
      res.status(403);
      throw new Error(
        `${message}. Please whitelist your server/public IP in the PlanAPI dashboard.`,
      );
    }

    res.status(502);
    throw new Error(message);
  }

  const { message } = verifyOtpResult;

  // Deduct from wallet/free checks on successful verification
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

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
    const cost = await calculateVerificationCost(user, "aadhaar");
    const wallet = await Wallet.getOrCreateWallet(user._id);
    wallet.balance -= cost;
    wallet.transactions.push({
      type: "debit",
      amount: cost,
      description: `Aadhaar verification charges (${cost} Points)`,
    });
    await wallet.save();
  }

  const aadhaarVerificationToken = createAadhaarVerificationToken({
    userId: req.user._id.toString(),
    aadhaarNumber,
    providerRefId: decodedSession.refId,
  });

  res.status(200).json({
    success: true,
    message: message || "Aadhaar verified successfully",
    aadhaarVerificationToken,
    // Backward-compatible key spelling to avoid frontend mismatches.
    aadharVerificationToken: aadhaarVerificationToken,
    maskedAadhaar: maskAadhaarNumber(aadhaarNumber),
  });
});

// @desc    Verify Aadhaar KYC via image OCR (front + back)
// @route   POST /api/aadhaar/verify-kyc
// @access  Private
const verifyAadhaarKyc = asyncHandler(async (req, res) => {
  console.log("[KYC] Received request from user:", req.user?._id);
  const fileKeys = Object.keys(req.files || {});
  console.log("[KYC] Files keys received:", fileKeys);

  try {
    // Multer populates req.files as an object keyed by field name
    // Handle both "FrontImage" and "frontImage" (just in case frontend changes)
    const frontFile = req.files?.FrontImage?.[0] || req.files?.frontImage?.[0];
    const backFile = req.files?.BackImage?.[0] || req.files?.backImage?.[0];

    if (!frontFile || !backFile) {
      console.warn("[KYC] Missing files. Available keys:", fileKeys);
      res.status(400);
      throw new Error(
        `Both front and back Aadhaar card images are required. Received: ${fileKeys.join(", ") || "none"}`,
      );
    }

    console.log("[KYC] Files identified - Front:", frontFile.originalname, "Back:", backFile.originalname);

    // Check if user is already KYC verified
    const userCheck = await User.findById(req.user._id);
    if (!userCheck) {
      res.status(404);
      throw new Error("User not found");
    }

    if (userCheck.aadhaarKyc?.status === "verified") {
      res.status(400);
      throw new Error("Your Aadhaar KYC is already verified");
    }

    // Check balance / free checks before calling external OCR API
    if (userCheck.freeChecksRemaining === 0) {
      if (userCheck.plan === "free" || userCheck.plan === "none") {
        res.status(400);
        throw new Error("Free checks exhausted. Please purchase a credit plan to verify identity.");
      }

      const cost = await calculateVerificationCost(userCheck, "aadhaar");
      const wallet = await Wallet.getOrCreateWallet(userCheck._id);
      if (wallet.balance < cost) {
        res.status(400);
        throw new Error(`Insufficient wallet balance. Aadhaar verification requires ${cost} Points.`);
      }
    }

    let ocrResult;
    try {
      ocrResult = await verifyAadhaarByImages(
        frontFile.buffer,
        backFile.buffer,
        frontFile.originalname,
        backFile.originalname,
      );
    } catch (error) {
      console.error("[KYC] PlanAPI OCR error detail:", error);
      const message = error?.message || "Aadhaar OCR verification failed";

      if (/whitelist|ip address/i.test(message)) {
        res.status(403);
        return res.json({
          success: false,
          message: `${message}. Please whitelist your server IP in the PlanAPI dashboard.`,
        });
      }

      res.status(400);
      return res.json({
        success: false,
        message: message,
      });
    }

    console.log("[KYC] OCR result:", JSON.stringify({ aadhaarNumber: ocrResult.aadhaarNumber, name: ocrResult.name, valid: ocrResult.valid }));

    // Deduct from wallet/free checks on successful verification
    if (user.freeChecksRemaining > 0) {
      user.freeChecksRemaining -= 1;
      const wallet = await Wallet.getOrCreateWallet(user._id);
      wallet.transactions.push({
        type: "debit",
        amount: 0,
        description: `Free Identity Check (Remaining: ${user.freeChecksRemaining})`,
      });
      await wallet.save();
    } else {
      const cost = await calculateVerificationCost(user, "aadhaar");
      const wallet = await Wallet.getOrCreateWallet(user._id);
      wallet.balance -= cost;
      wallet.transactions.push({
        type: "debit",
        amount: cost,
        description: `Aadhaar verification charges (${cost} Points)`,
      });
      await wallet.save();
    }

    user.aadhaarKyc = {
      status: "verified",
      maskedAadhaar: ocrResult.aadhaarNumber || "",
      name: ocrResult.name || "",
      dob: ocrResult.dob || "",
      address: ocrResult.address || "",
      state: ocrResult.state || "",
      pincode: ocrResult.pincode || "",
      verifiedAt: new Date(),
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "Aadhaar KYC verified successfully",
      aadhaarKyc: user.aadhaarKyc,
    });
  } catch (error) {
    console.error("[KYC] Unexpected error:", error?.message || error);
    // If headers already sent, let Express handle it
    if (res.headersSent) return;
    const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Aadhaar KYC verification failed",
    });
  }
});

// @desc    Step 1: Initialize DigiLocker KYC session
// @route   POST /api/aadhaar/digilocker/initialize
// @access  Private
const initializeDigilocker = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.aadhaarKyc?.status === "verified") {
      return res.status(400).json({
        success: false,
        message: "Your Aadhaar KYC is already verified",
      });
    }

    // Check balance / free checks before initializing DigiLocker
    if (user.freeChecksRemaining === 0) {
      if (user.plan === "free" || user.plan === "none") {
        return res.status(400).json({
          success: false,
          message: "Free checks exhausted. Please purchase a credit plan to verify identity.",
        });
      }

      const cost = await calculateVerificationCost(user, "aadhaar");
      const wallet = await Wallet.getOrCreateWallet(user._id);
      if (wallet.balance < cost) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Aadhaar verification requires ${cost} Points.`,
        });
      }
    }

    const { name, email, mobileNumber } = req.user;
    
    // We can use a custom redirect URL or let frontend handle it
    const result = await initializeDigilockerSession({
      name: name,
      email: email,
      mobileNo: mobileNumber,
      redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/kyc-callback`,
    });

    res.status(200).json({
      success: true,
      clientId: result.clientId,
      url: result.url,
      expiry: result.expiry,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to initialize DigiLocker session",
    });
  }
});

// @desc    Step 2: Check DigiLocker session status
// @route   POST /api/aadhaar/digilocker/status
// @access  Private
const getDigilockerStatus = asyncHandler(async (req, res) => {
  const { clientId } = req.body;
  if (!clientId) {
    res.status(400);
    throw new Error("Client ID is required");
  }

  try {
    const result = await checkDigilockerStatus(clientId);
    res.status(200).json({
      success: true,
      isCompleted: result.isCompleted,
      isFailed: result.isFailed,
      aadhaarLinked: result.aadhaarLinked,
      status: result.status,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to check DigiLocker status",
    });
  }
});

// @desc    Step 3: Complete KYC using DigiLocker data
// @route   POST /api/aadhaar/digilocker/complete
// @access  Private
const completeDigilockerKyc = asyncHandler(async (req, res) => {
  const { clientId } = req.body;
  if (!clientId) {
    res.status(400);
    throw new Error("Client ID is required");
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    // Guard: If already verified, return successful response immediately to avoid duplicate API calls/costs
    if (user.aadhaarKyc?.status === "verified") {
      return res.status(200).json({
        success: true,
        message: "DigiLocker KYC completed successfully",
        aadhaarKyc: user.aadhaarKyc,
      });
    }

    // Skip status check — it costs API points. The redirect from DigiLocker
    // already confirms auth completion. downloadDigilockerAadhaar will fail
    // if the session isn't actually ready.
    const aadhaarData = await downloadDigilockerAadhaar(clientId);

    // Deduct from wallet/free checks on successful DigiLocker completion
    if (user.freeChecksRemaining > 0) {
      user.freeChecksRemaining -= 1;
      const wallet = await Wallet.getOrCreateWallet(user._id);
      wallet.transactions.push({
        type: "debit",
        amount: 0,
        description: `Free Identity Check (Remaining: ${user.freeChecksRemaining})`,
      });
      await wallet.save();
    } else {
      const cost = await calculateVerificationCost(user, "aadhaar");
      const wallet = await Wallet.getOrCreateWallet(user._id);
      wallet.balance -= cost;
      wallet.transactions.push({
        type: "debit",
        amount: cost,
        description: `Aadhaar verification charges (${cost} Points)`,
      });
      await wallet.save();
    }

    user.aadhaarKyc = {
      status: "verified",
      maskedAadhaar: aadhaarData.maskedAadhaar || "",
      name: aadhaarData.fullName || "",
      dob: aadhaarData.dob || "",
      address: aadhaarData.fullAddress || "",
      state: aadhaarData.state || "",
      pincode: aadhaarData.pincode || "",
      verifiedAt: new Date(),
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "DigiLocker KYC completed successfully",
      aadhaarKyc: user.aadhaarKyc,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to complete DigiLocker KYC",
    });
  }
});

export {
  sendAadhaarOtp,
  verifyAadhaarOtp,
  verifyAadhaarKyc,
  initializeDigilocker,
  getDigilockerStatus,
  completeDigilockerKyc,
};

