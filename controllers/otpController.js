import asyncHandler from "express-async-handler";
import { sendOTP, verifyOTP } from "../utils/smsService.js";

// @desc    Send OTP to mobile number
// @route   POST /api/otp/send
// @access  Public
const sendOtp = asyncHandler(async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    res.status(400);
    throw new Error("Phone number is required");
  }

  // Validate 10 digit phone number
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  if (cleanPhone.length !== 10) {
    res.status(400);
    throw new Error("Invalid phone number. Must be 10 digits.");
  }

  try {
    const sessionId = await sendOTP(cleanPhone);
    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      sessionId,
    });
  } catch (error) {
    res.status(500);
    throw new Error(error.message || "Failed to send OTP");
  }
});

// @desc    Verify OTP
// @route   POST /api/otp/verify
// @access  Public
const verifyOtp = asyncHandler(async (req, res) => {
  const { sessionId, otp } = req.body;

  if (!sessionId || !otp) {
    res.status(400);
    throw new Error("Session ID and OTP are required");
  }

  try {
    const isVerified = await verifyOTP(sessionId, otp);
    if (isVerified) {
      res.status(200).json({
        success: true,
        message: "OTP verified successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }
  } catch (error) {
    res.status(400);
    throw new Error(error.message || "Failed to verify OTP");
  }
});

export { sendOtp, verifyOtp };
