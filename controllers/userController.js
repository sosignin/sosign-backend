import asyncHandler from "express-async-handler";
import generateToken from "../utils/generateToken.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import Petition from "../models/petitionModel.js";
import Notification from "../models/notificationModel.js";
import fetch from "node-fetch";
import ConsentLog from "../models/consentLogModel.js";
import { getCleanIp } from "../utils/ipHelper.js";

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    if (user.isSuspended) {
      res.status(403);
      throw new Error("Your account has been suspended. Please contact support.");
    }
    const token = generateToken(res, user._id);

    // Populate petitions before sending the response
    const userWithPetitions = await User.findById(user._id).populate(
      "petitions"
    );

    res.json({
      _id: userWithPetitions._id,
      name: userWithPetitions.name,
      email: userWithPetitions.email,
      uniqueCode: userWithPetitions.uniqueCode,
      designation: userWithPetitions.designation,
      mobileNumber: userWithPetitions.mobileNumber,
      bio: userWithPetitions.bio || "",
      profilePicture: userWithPetitions.profilePicture || "",
      socialLinks: userWithPetitions.socialLinks || {},
      petitions: userWithPetitions.petitions, // Include petitions data
      token: token, // Include token in response
      hasPassword: !!user.password,
      googleId: user.googleId,
      aadhaarKyc: userWithPetitions.aadhaarKyc || { status: "not_verified" },
      panKyc: userWithPetitions.panKyc || { status: "not_verified" },
      voterKyc: userWithPetitions.voterKyc || { status: "not_verified" },
      plan: userWithPetitions.plan || "free",
      freeChecksRemaining: userWithPetitions.freeChecksRemaining !== undefined ? userWithPetitions.freeChecksRemaining : 4,
      isMinor: !!userWithPetitions.isMinor,
      parentalConsent: userWithPetitions.parentalConsent || { status: "not_required" },
    });
  } else {
    res.status(401);
    throw new Error("Invalid email or password");
  }
});

// @desc    Register a new user
// @route   POST /api/users
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const {
    name,
    designation,
    email,
    mobileNumber,
    password,
    isMinor = false,
    dateOfBirth = null,
    guardianName = "",
    guardianEmail = "",
    guardianPhone = "",
    relationship = "Parent/Guardian",
  } = req.body;
  
  // Validate email with ValidEmail.net API
  try {
    const validationToken = process.env.VALID_EMAIL_TOKEN || "2bfb71cea3dc47ea8f4cf47b5862fa60";
    const emailValidationResponse = await fetch(
      `https://api.ValidEmail.net/?email=${encodeURIComponent(email)}&token=${validationToken}`
    );
    const emailValidationData = await emailValidationResponse.json();

    const apiIsValid = emailValidationData && (emailValidationData.isValid !== undefined ? emailValidationData.isValid : emailValidationData.IsValid);
    if (emailValidationData && apiIsValid === false) {
      res.status(400);
      throw new Error(`The email address provided appears to be invalid or 'fake'. Please use a real email address to join SoSign.`);
    }
  } catch (error) {
    console.error("Email validation API error:", error);
    // If it's the specific validation error we threw, rethrow it
    if (res.statusCode === 400) throw error;
    // For other network errors to the validation API, we might choose to allow registration 
    // to avoid blocking users if the external service is down, or strictly enforce it.
    // The user requested a specific message for fake emails.
  }

  const userExists = await User.findOne({ 
    $or: [
      { email }, 
      { mobileNumber: mobileNumber }
    ] 
  });

  if (userExists) {
    res.status(400);
    if (userExists.email === email) {
      throw new Error("User with this email already exists");
    } else {
      throw new Error("This mobile number is already in use. Please use a different number.");
    }
  }

  const userIsMinor = isMinor === true || isMinor === "true";
  const parentalConsentStatus = userIsMinor ? "pending" : "not_required";

  const user = await User.create({
    name,
    designation,
    email,
    mobileNumber,
    password,
    isMinor: userIsMinor,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    childTrackingBypassed: userIsMinor,
    parentalConsent: {
      status: parentalConsentStatus,
      guardianName: guardianName || "",
      guardianEmail: guardianEmail || "",
      guardianPhone: guardianPhone || "",
      relationship: relationship || "Parent/Guardian",
    },
  });

  if (user) {
    await Wallet.getOrCreateWallet(user._id);

    // DPDP Act Sec 6(10) Statutory Consent Proof Logging
    try {
      const ipAddress = getCleanIp(req);
      const userAgent = req.headers["user-agent"] || "";
      await ConsentLog.create({
        user: user._id,
        userName: user.name,
        userEmail: user.email,
        ipAddress,
        userAgent,
        consentType: "registration",
        purpose: "Citizen account registration and identity verification under DPDP Act 2023",
        noticeVersion: "2026.1-DPDP",
        noticeLanguage: req.body.noticeLanguage || "en",
        granted: true,
        method: "affirmative_checkbox",
        metadata: {
          designation: user.designation,
          mobileNumber: user.mobileNumber,
        },
      });
    } catch (consentErr) {
      console.error("Failed to log registration consent:", consentErr);
    }
    const token = generateToken(res, user._id);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      uniqueCode: user.uniqueCode,
      designation: user.designation,
      email: user.email,
      mobileNumber: user.mobileNumber,
      bio: user.bio || "",
      profilePicture: user.profilePicture || "",
      socialLinks: user.socialLinks || {},
      token: token, // Include token in response
      hasPassword: !!user.password,
      googleId: user.googleId,
      aadhaarKyc: user.aadhaarKyc || { status: "not_verified" },
      panKyc: user.panKyc || { status: "not_verified" },
      voterKyc: user.voterKyc || { status: "not_verified" },
      plan: user.plan || "free",
      freeChecksRemaining: user.freeChecksRemaining !== undefined ? user.freeChecksRemaining : 4,
      isMinor: !!user.isMinor,
      parentalConsent: user.parentalConsent || { status: "not_required" },
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});

// @desc    Logout user / clear cookie
// @route   POST /api/users/logout
// @access  Public
const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: "Logged out successfully" });
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = {
    _id: req.user._id,
    name: req.user.name,
    uniqueCode: req.user.uniqueCode,
    designation: req.user.designation,
    email: req.user.email,
    mobileNumber: req.user.mobileNumber,
  };

  // Fetch the full user object with populated petitions
  const userWithPetitions = await User.findById(req.user._id).populate(
    "petitions"
  );

  if (userWithPetitions) {
    res.status(200).json({
      _id: userWithPetitions._id,
      name: userWithPetitions.name,
      uniqueCode: userWithPetitions.uniqueCode,
      designation: userWithPetitions.designation,
      email: userWithPetitions.email,
      mobileNumber: userWithPetitions.mobileNumber,
      bio: userWithPetitions.bio || "",
      profilePicture: userWithPetitions.profilePicture || "",
      socialLinks: userWithPetitions.socialLinks || {},
      petitions: userWithPetitions.petitions,
      hasPassword: !!userWithPetitions.password,
      googleId: userWithPetitions.googleId,
      aadhaarKyc: userWithPetitions.aadhaarKyc || { status: "not_verified" },
      panKyc: userWithPetitions.panKyc || { status: "not_verified" },
      voterKyc: userWithPetitions.voterKyc || { status: "not_verified" },
      plan: userWithPetitions.plan || "free",
      freeChecksRemaining: userWithPetitions.freeChecksRemaining !== undefined ? userWithPetitions.freeChecksRemaining : 4,
      isMinor: !!userWithPetitions.isMinor,
      parentalConsent: userWithPetitions.parentalConsent || { status: "not_required" },
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Update fields if provided
  const { name, bio, designation, mobileNumber } = req.body;
  let { socialLinks } = req.body;

  if (name !== undefined) user.name = name;
  if (bio !== undefined) user.bio = bio;
  if (designation !== undefined) user.designation = designation;
  if (mobileNumber !== undefined) user.mobileNumber = mobileNumber;

  // Handle social links update (parse from JSON string if needed - FormData sends as string)
  if (socialLinks !== undefined) {
    if (typeof socialLinks === 'string') {
      try {
        socialLinks = JSON.parse(socialLinks);
      } catch (e) {
        socialLinks = {};
      }
    }
    user.socialLinks = {
      facebook: socialLinks.facebook || user.socialLinks?.facebook || "",
      twitter: socialLinks.twitter || user.socialLinks?.twitter || "",
      linkedin: socialLinks.linkedin || user.socialLinks?.linkedin || "",
      instagram: socialLinks.instagram || user.socialLinks?.instagram || "",
      youtube: socialLinks.youtube || user.socialLinks?.youtube || "",
    };
  }

  // Handle profile picture upload
  if (req.file) {
    user.profilePicture = req.file.path; // Cloudinary URL
  }

  const updatedUser = await user.save();

  res.status(200).json({
    _id: updatedUser._id,
    name: updatedUser.name,
    uniqueCode: updatedUser.uniqueCode,
    designation: updatedUser.designation,
    email: updatedUser.email,
    mobileNumber: updatedUser.mobileNumber,
    bio: updatedUser.bio || "",
    profilePicture: updatedUser.profilePicture || "",
    aadhaarKyc: updatedUser.aadhaarKyc || { status: "not_verified" },
    panKyc: updatedUser.panKyc || { status: "not_verified" },
    voterKyc: updatedUser.voterKyc || { status: "not_verified" },
    plan: updatedUser.plan || "free",
    freeChecksRemaining: updatedUser.freeChecksRemaining !== undefined ? updatedUser.freeChecksRemaining : 4,
    message: "Profile updated successfully",
  });
});

// @desc    Auth user with Google
// @route   POST /api/users/google-auth
// @access  Public
const authGoogleUser = asyncHandler(async (req, res) => {
  const { email, name, photoURL, uid } = req.body;

  let user = await User.findOne({ email });

  if (user) {
    if (user.isSuspended) {
      res.status(403);
      throw new Error("Your account has been suspended. Please contact support.");
    }
    // If user exists but googleId is missing or different, update it
    if (user.googleId !== uid) {
      user.googleId = uid;
      await user.save();
    }

    // User exists, log them in
    const token = generateToken(res, user._id);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      uniqueCode: user.uniqueCode,
      designation: user.designation, // May not be available for Google sign-ups
      mobileNumber: user.mobileNumber, // May not be available for Google sign-ups
      photoURL: user.profilePicture || user.photoURL || photoURL, // Use profilePicture if available
      bio: user.bio || "",
      profilePicture: user.profilePicture || "",
      socialLinks: user.socialLinks || {},
      petitions: user.petitions, // Include petitions data
      token: token, // Include token in response
      hasPassword: !!user.password,
      googleId: user.googleId,
      aadhaarKyc: user.aadhaarKyc || { status: "not_verified" },
      panKyc: user.panKyc || { status: "not_verified" },
      voterKyc: user.voterKyc || { status: "not_verified" },
      plan: user.plan || "free",
      freeChecksRemaining: user.freeChecksRemaining !== undefined ? user.freeChecksRemaining : 4,
    });
  } else {
    // User does not exist, register them
    user = await User.create({
      name,
      email,
      photoURL,
      googleId: uid, // Store Google's UID for future reference
      // For Google registered users, password/designation/mobileNumber might be optional
      // You might want to handle default values or prompt user later for these
    });

    if (user) {
      await Wallet.getOrCreateWallet(user._id);
      const token = generateToken(res, user._id);
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        uniqueCode: user.uniqueCode,
        designation: user.designation,
        mobileNumber: user.mobileNumber,
        bio: user.bio || "",
        profilePicture: user.profilePicture || "",
        socialLinks: user.socialLinks || {},
        petitions: user.petitions, // Include petitions data
        token: token, // Include token in response
        hasPassword: !!user.password,
        googleId: user.googleId,
        aadhaarKyc: user.aadhaarKyc || { status: "not_verified" },
        panKyc: user.panKyc || { status: "not_verified" },
        voterKyc: user.voterKyc || { status: "not_verified" },
        plan: user.plan || "free",
        freeChecksRemaining: user.freeChecksRemaining !== undefined ? user.freeChecksRemaining : 4,
      });
    } else {
      res.status(400);
      throw new Error("Invalid Google user data");
    }
  }
});

// @desc    Send password reset email
// @route   POST /api/users/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Please provide an email address");
  }

  // Validate email with ValidEmail.net API before proceeding
  try {
    const validationToken = process.env.VALID_EMAIL_TOKEN || "2bfb71cea3dc47ea8f4cf47b5862fa60";
    const emailValidationResponse = await fetch(
      `https://api.ValidEmail.net/?email=${encodeURIComponent(email)}&token=${validationToken}`
    );
    const emailValidationData = await emailValidationResponse.json();

    const apiIsValid = emailValidationData && (emailValidationData.isValid !== undefined ? emailValidationData.isValid : emailValidationData.IsValid);
    const apiDisposable = emailValidationData && (emailValidationData.disposable !== undefined ? emailValidationData.disposable : emailValidationData.Disposable);
    const apiScore = emailValidationData && (emailValidationData.score !== undefined ? emailValidationData.score : emailValidationData.Score);

    if (emailValidationData && apiIsValid === false) {
      res.status(400);
      throw new Error("The email address provided appears to be invalid. Please enter a valid email address.");
    }

    // Block disposable/temporary email addresses
    if (emailValidationData && apiDisposable === true) {
      res.status(400);
      throw new Error("Disposable/temporary email addresses are not allowed. Please use a permanent email address.");
    }

    // Block emails with very low confidence score
    if (emailValidationData && apiScore !== undefined && apiScore < 50) {
      res.status(400);
      throw new Error("The email address provided could not be verified. Please check and try again.");
    }
  } catch (error) {
    console.error("Email validation API error:", error);
    // If it's a validation error we threw, rethrow it
    if (res.statusCode === 400) throw error;
    // For network errors to the validation API, allow through
  }

  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if user exists or not for security
    res.status(200).json({ message: "If an account with that email exists, a password reset link has been sent." });
    return;
  }

  // Check if user signed up with Google (no password)
  if (user.googleId && !user.password) {
    res.status(400);
    throw new Error("This account uses Google Sign-In. Please login with Google.");
  }

  // Generate reset token (random 32 char hex string)
  const crypto = await import('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token and save to user
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = Date.now() + 3600000; // 1 hour from now
  await user.save();

  // Create reset URL dynamically based on request origin or fallback
  let origin = req.headers.origin;
  if (!origin && req.headers.referer) {
    try {
      origin = new URL(req.headers.referer).origin;
    } catch (e) {
      // ignore
    }
  }
  const frontendUrl = origin || process.env.FRONTEND_URL || 'https://www.sosign.in';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  // Send email using SMTP
  try {
    const { sendEmail } = await import('../config/emailConfig.js');

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your SoSign Password</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; color: #1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <tr>
      <td style="padding: 30px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #f3f4f6;">
        <h1 style="margin: 0; color: #F43676; font-size: 28px; font-weight: 800;">SoSign</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px;">
        <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px;">Password Reset Request</h2>
        <p style="margin: 0 0 16px 0; line-height: 1.6; color: #4b5563; font-size: 15px;">
          Hello ${user.name || 'User'},
        </p>
        <p style="margin: 0 0 24px 0; line-height: 1.6; color: #4b5563; font-size: 15px;">
          We received a request to reset the password for your SoSign account. Click the button below to choose a new password:
        </p>
        <table cellpadding="0" cellspacing="0" style="margin: 0 auto 24px auto;">
          <tr>
            <td align="center" style="border-radius: 8px; background: #F43676;">
              <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 30px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">Reset Password</a>
            </td>
          </tr>
        </table>
        <p style="margin: 0 0 12px 0; line-height: 1.5; color: #6b7280; font-size: 14px;">
          If the button above does not work, copy and paste this link into your browser:
        </p>
        <p style="margin: 0 0 24px 0; word-break: break-all; color: #F43676; font-size: 13px;">
          <a href="${resetUrl}" style="color: #F43676;">${resetUrl}</a>
        </p>
        <p style="margin: 0; line-height: 1.5; color: #9ca3af; font-size: 13px;">
          This link will expire in 60 minutes. If you did not make this request, you can safely ignore this message.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 30px; background-color: #f9fafb; text-align: center; border-top: 1px solid #f3f4f6; color: #9ca3af; font-size: 12px;">
        &copy; ${new Date().getFullYear()} SoSign. All rights reserved.<br>
        India's Civic Engagement & Petition Platform
      </td>
    </tr>
  </table>
</body>
</html>`;

    const emailText = `Hello ${user.name || 'User'},

We received a request to reset the password for your SoSign account.

To choose a new password, visit the following link:
${resetUrl}

This link will expire in 60 minutes. If you did not make this request, you can safely ignore this message.

© ${new Date().getFullYear()} SoSign. All rights reserved.`;

    let emailSent = false;
    let emailError = null;

    try {
      const emailResult = await sendEmail(
        user.email,
        'Reset Your Password - SoSign',
        emailHtml,
        emailText
      );

      if (emailResult.success) {
        emailSent = true;
      } else {
        emailError = emailResult.error;
      }
    } catch (err) {
      emailError = err.message;
    }

    if (emailSent) {
      console.log('Password reset email successfully sent to:', user.email);
      res.status(200).json({
        success: true,
        message: "Password reset link has been sent to your email. Please check your inbox or spam folder."
      });
    } else {
      console.error("Password reset email delivery failed:", emailError);
      // Clean up token if email delivery failed
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save();

      res.status(500).json({
        success: false,
        message: "Failed to deliver password reset email. Please try again later or contact support."
      });
    }
  } catch (error) {
    // Clear the reset token if anything else fails
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    console.error("Forgot password internal error:", error);
    res.status(500);
    throw new Error("Failed to process password reset request. Please try again later.");
  }
});

// @desc    Reset password with token
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    res.status(400);
    throw new Error("Token and new password are required");
  }

  // Validate password
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{6,}$/;
  if (!passwordRegex.test(password)) {
    res.status(400);
    throw new Error("Password must be at least 6 characters with uppercase, lowercase, and special character");
  }

  // Hash the provided token to compare with stored hash
  const crypto = await import('crypto');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user with valid token
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error("Invalid or expired reset token. Please request a new password reset.");
  }

  // Update password and clear reset fields
  user.password = password;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  await user.save();

  res.status(200).json({ message: "Password has been reset successfully. You can now login with your new password." });
});

// @desc    Change or set password
// @route   PUT /api/users/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Validate new password
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>]).{6,}$/;
  if (!passwordRegex.test(newPassword)) {
    res.status(400);
    throw new Error("Password must be at least 6 characters with uppercase, lowercase, and special character");
  }

  // If user already has a password, verify the current one
  // We check if password exists and is not an empty string
  const hasExistingPassword = user.password && user.password.length > 0;
  
  if (hasExistingPassword) {
    // For users with an existing password, we normally require the current one.
    // Exception: If the user is a Google-linked user, we allow them to set/change 
    // their password without the current one since they are already verified via Google.
    if (!currentPassword && !user.googleId) {
      res.status(400);
      throw new Error("Please provide your current password");
    }

    // If current password is provided, we must verify it even for Google users
    if (currentPassword) {
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        res.status(401);
        throw new Error("Incorrect current password");
      }
    }
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({ 
    success: true,
    message: user.password ? "Password updated successfully" : "Password created successfully",
    hasPassword: true 
  });
});

// @desc    Get public user info by unique code
// @route   GET /api/users/code/:code
// @access  Public
const getUserByCode = asyncHandler(async (req, res) => {
  const code = (req.params.code || "").trim().toUpperCase();
  if (!code) {
    res.status(400);
    throw new Error("Code is required");
  }
  const user = await User.findOne({ uniqueCode: code }).select(
    "name email designation uniqueCode"
  );
  if (!user) {
    res.status(404);
    throw new Error("User not found for this code");
  }
  res.status(200).json({
    _id: user._id,
    name: user.name,
    email: user.email,
    designation: user.designation,
    uniqueCode: user.uniqueCode,
  });
});

// @desc    Get public user profile by ID or unique code
// @route   GET /api/users/public/:id
// @access  Public (Optional Auth)
const getUserPublicProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let user;
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    user = await User.findById(id)
      .populate("followers", "name profilePicture designation uniqueCode")
      .populate("following", "name profilePicture designation uniqueCode");
  } else {
    user = await User.findOne({ uniqueCode: id.trim().toUpperCase() })
      .populate("followers", "name profilePicture designation uniqueCode")
      .populate("following", "name profilePicture designation uniqueCode");
  }

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Fetch petitions created by this user
  const petitions = await Petition.find({
    "petitionStarter.user": user._id,
  })
    .select(
      "title slug categories petitionDetails numberOfSignatures goalSignatures status createdAt isFeaturedInBanner"
    )
    .sort({ createdAt: -1 });

  // Calculate total signatures received
  const totalSignaturesReceived = petitions.reduce(
    (acc, pet) => acc + (pet.numberOfSignatures || 0),
    0
  );

  // Determine if requesting user is following this profile
  let isFollowing = false;
  if (req.user) {
    isFollowing = (user.followers || []).some(
      (f) => f._id ? f._id.toString() === req.user._id.toString() : f.toString() === req.user._id.toString()
    );
  }

  res.status(200).json({
    _id: user._id,
    name: user.name,
    designation: user.designation || "Citizen",
    bio: user.bio || "",
    profilePicture: user.profilePicture || "",
    uniqueCode: user.uniqueCode || "",
    socialLinks: user.socialLinks || {},
    isVerified: user.aadhaarKyc?.status === "verified",
    createdAt: user.createdAt,
    followersCount: (user.followers || []).length,
    followingCount: (user.following || []).length,
    followers: user.followers || [],
    following: user.following || [],
    petitions: petitions || [],
    stats: {
      totalPetitions: petitions.length,
      totalSignatures: totalSignaturesReceived,
      followersCount: (user.followers || []).length,
      followingCount: (user.following || []).length,
    },
    isFollowing,
  });
});

// @desc    Follow or unfollow a user
// @route   POST /api/users/:id/follow
// @access  Private
const followUser = asyncHandler(async (req, res) => {
  const targetUserId = req.params.id;
  const currentUserId = req.user._id;

  if (targetUserId.toString() === currentUserId.toString()) {
    res.status(400);
    throw new Error("You cannot follow yourself");
  }

  const targetUser = await User.findById(targetUserId);
  const currentUser = await User.findById(currentUserId);

  if (!targetUser || !currentUser) {
    res.status(404);
    throw new Error("User not found");
  }

  const isAlreadyFollowing = (targetUser.followers || []).some(
    (id) => id.toString() === currentUserId.toString()
  );

  if (isAlreadyFollowing) {
    // Unfollow
    targetUser.followers = (targetUser.followers || []).filter(
      (id) => id.toString() !== currentUserId.toString()
    );
    currentUser.following = (currentUser.following || []).filter(
      (id) => id.toString() !== targetUserId.toString()
    );
  } else {
    // Follow
    if (!targetUser.followers) targetUser.followers = [];
    if (!currentUser.following) currentUser.following = [];

    targetUser.followers.push(currentUserId);
    currentUser.following.push(targetUserId);

    // Send notification to target user
    try {
      await Notification.create({
        recipient: targetUser._id,
        title: "New Follower",
        message: `${currentUser.name} started following you on SoSign.`,
        type: "info",
        relatedId: currentUser._id,
      });
    } catch (notifErr) {
      console.error("Failed to create follow notification:", notifErr);
    }
  }

  await targetUser.save();
  await currentUser.save();

  res.status(200).json({
    success: true,
    isFollowing: !isAlreadyFollowing,
    followersCount: targetUser.followers.length,
    followingCount: targetUser.following.length,
    message: !isAlreadyFollowing ? `Now following ${targetUser.name}` : `Unfollowed ${targetUser.name}`,
  });
});

// @desc    Render Google Web Login Bridge for Mobile App
// @route   GET /api/users/google-web-login
// @access  Public
const renderGoogleWebLogin = (req, res) => {
  const redirectUrl = req.query.redirect_url || 'sosign://oauth-callback';
  
  // Directly redirect to the official website login page with app_redirect parameter
  // so the user authenticates on the live SoSign website and gets returned to the app
  const websiteLoginUrl = `https://www.sosign.in/login?app_redirect=${encodeURIComponent(redirectUrl)}`;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>SoSign - Google Sign-In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #1E1B4B 0%, #302D55 50%, #0F172A 100%);
      color: #FFFFFF;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #FFFFFF;
      color: #1E293B;
      border-radius: 28px;
      padding: 36px 28px;
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #FFF1F2;
      width: 64px;
      height: 64px;
      border-radius: 20px;
      margin-bottom: 20px;
      border: 1.5px solid #FFE4E6;
    }
    .title {
      font-size: 22px;
      font-weight: 800;
      color: #1E1B4B;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    .sub {
      font-size: 13px;
      color: #64748B;
      margin-bottom: 28px;
      line-height: 1.6;
    }
    .btn-google {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 16px 20px;
      background: #FFFFFF;
      border: 2px solid #E2E8F0;
      border-radius: 16px;
      font-weight: 700;
      font-size: 15px;
      color: #334155;
      cursor: pointer;
      text-decoration: none;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
      transition: all 0.2s ease;
      user-select: none;
    }
    .btn-google:hover, .btn-google:active {
      border-color: #F43676;
      background: #FFF1F2;
      transform: scale(0.99);
    }
    .footer-note {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #F1F5F9;
      font-size: 11px;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-badge">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F43676" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    </div>

    <h1 class="title">SoSign Authentication</h1>
    <p class="sub">Sign in with your Google account to access your petitions and wallet in the SoSign Mobile App.</p>

    <a href="${websiteLoginUrl}" class="btn-google" id="googleBtn">
      <svg width="20" height="20" viewBox="0 0 18 18" style="margin-right:12px;">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
        <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.59.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.039l3.007-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
      </svg>
      Continue with Google
    </a>

    <div class="footer-note">
      Verified authentication powered by SoSign & Google OAuth
    </div>
  </div>

  <script>
    // Auto redirect to website login page
    setTimeout(function() {
      window.location.href = "${websiteLoginUrl}";
    }, 400);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
};

// @desc    Export machine-readable personal data (DPDP Act, Section 11 - Right to Access)
// @route   GET /api/users/export-my-data
// @access  Private
const exportUserData = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -passwordResetToken -passwordResetExpires");

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Fetch authored petitions
  const authoredPetitions = await Petition.find({
    "petitionStarter.user": user._id,
  }).select("title slug status numberOfSignatures createdAt categories");

  // Fetch signed petitions
  const signedPetitions = await Petition.find({
    "signatures.user": user._id,
  }).select("title slug status signatures");

  const formattedSignatures = signedPetitions.map((p) => {
    const userSig = p.signatures?.find(
      (s) => s.user && s.user.toString() === user._id.toString()
    );
    return {
      petitionTitle: p.title,
      petitionSlug: p.slug,
      signedAt: userSig?.signedAt || null,
      constituencyNumber: userSig?.constituencyNumber || null,
    };
  });

  const exportPayload = {
    metadata: {
      platform: "SoSign Civic Platform",
      dataFiduciary: "LEO MEO IT Solution",
      statutoryRight: "Right to Access under Section 11, Digital Personal Data Protection Act, 2023",
      generatedAt: new Date().toISOString(),
      exportFormat: "JSON Machine-Readable Personal Data Archive",
    },
    userProfile: {
      userId: user._id,
      uniqueCode: user.uniqueCode,
      name: user.name,
      email: user.email,
      mobileNumber: user.mobileNumber || "Not Provided",
      designation: user.designation || "",
      bio: user.bio || "",
      profilePicture: user.profilePicture || "",
      socialLinks: user.socialLinks || {},
      accountCreated: user.createdAt,
      lastUpdated: user.updatedAt,
    },
    kycStatus: {
      aadhaarKyc: {
        status: user.aadhaarKyc?.status || "not_verified",
        maskedAadhaar: user.aadhaarKyc?.maskedAadhaar || "",
        verifiedName: user.aadhaarKyc?.name || "",
        district: user.aadhaarKyc?.district || "",
        state: user.aadhaarKyc?.state || "",
        verifiedAt: user.aadhaarKyc?.verifiedAt || null,
        verificationMethod: user.aadhaarKyc?.verificationMethod || "None",
      },
      panKyc: {
        status: user.panKyc?.status || "not_verified",
        registeredName: user.panKyc?.registeredName || "",
        panType: user.panKyc?.panType || "",
        verifiedAt: user.panKyc?.verifiedAt || null,
      },
      voterKyc: {
        status: user.voterKyc?.status || "not_verified",
        registeredName: user.voterKyc?.registeredName || "",
        area: user.voterKyc?.area || "",
        district: user.voterKyc?.district || "",
        verifiedAt: user.voterKyc?.verifiedAt || null,
      },
    },
    consentAndPrivacy: {
      acceptedPolicyVersion: user.consentRecords?.acceptedPrivacyPolicyVersion || "2026.1-DPDP",
      acceptedAt: user.consentRecords?.acceptedAt || user.createdAt,
      marketingConsent: user.consentRecords?.marketingConsent ?? true,
      analyticsConsent: user.consentRecords?.analyticsConsent ?? true,
      consentHistory: user.consentRecords?.consentHistory || [],
    },
    advocacyRecords: {
      authoredPetitionsCount: authoredPetitions.length,
      authoredPetitions,
      signedPetitionsCount: formattedSignatures.length,
      signedPetitions: formattedSignatures,
    },
  };

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sosign-personal-data-${user._id}.json"`
  );
  res.setHeader("Content-Type", "application/json");
  res.status(200).json(exportPayload);
});

// @desc    Permanently delete account & erase personal data (DPDP Act, Section 12 - Right to Erasure)
// @route   DELETE /api/users/delete-account
// @access  Private
const deleteUserAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // If password is provided, optionally verify it for non-Google accounts
  const { confirmationPassword } = req.body || {};
  if (user.password && confirmationPassword) {
    const isMatch = await user.matchPassword(confirmationPassword);
    if (!isMatch) {
      res.status(401);
      throw new Error("Incorrect confirmation password");
    }
  }

  const userId = user._id;

  // 1. Unlink personal identity from petition signatures so aggregate civic vote counts remain accurate
  // but citizen personal data is permanently unlinked
  await Petition.updateMany(
    { "signatures.user": userId },
    {
      $set: {
        "signatures.$[elem].user": null,
        "signatures.$[elem].aadharNumber": undefined,
      },
    },
    {
      arrayFilters: [{ "elem.user": userId }],
    }
  );

  // 2. Remove user from social followers/following arrays
  await User.updateMany({ followers: userId }, { $pull: { followers: userId } });
  await User.updateMany({ following: userId }, { $pull: { following: userId } });

  // 3. Delete user wallet if exists
  await Wallet.deleteOne({ user: userId });

  // 4. Delete notifications
  await Notification.deleteMany({ user: userId });

  // 5. Delete user record permanently
  await User.findByIdAndDelete(userId);

  // 6. Clear session cookie
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0),
  });

  res.status(200).json({
    success: true,
    message: "Your account and personal data have been permanently erased in compliance with the Digital Personal Data Protection Act, 2023.",
  });
});

// @desc    Update consent preferences (DPDP Act, Section 6)
// @route   POST /api/users/consent
// @access  Private
const updateConsentPreferences = asyncHandler(async (req, res) => {
  const { marketingConsent, analyticsConsent, policyVersion } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (!user.consentRecords) {
    user.consentRecords = {
      acceptedPrivacyPolicyVersion: "2026.1-DPDP",
      acceptedAt: new Date(),
      marketingConsent: true,
      analyticsConsent: true,
      consentHistory: [],
    };
  }

  const clientIp = getCleanIp(req);

  if (marketingConsent !== undefined) {
    user.consentRecords.marketingConsent = Boolean(marketingConsent);
    user.consentRecords.consentHistory.push({
      purpose: "marketing_communications",
      granted: Boolean(marketingConsent),
      timestamp: new Date(),
      ipAddress: String(clientIp).split(",")[0].trim(),
    });
  }

  if (analyticsConsent !== undefined) {
    user.consentRecords.analyticsConsent = Boolean(analyticsConsent);
    user.consentRecords.consentHistory.push({
      purpose: "analytics_cookies",
      granted: Boolean(analyticsConsent),
      timestamp: new Date(),
      ipAddress: String(clientIp).split(",")[0].trim(),
    });
  }

  if (policyVersion) {
    user.consentRecords.acceptedPrivacyPolicyVersion = policyVersion;
    user.consentRecords.acceptedAt = new Date();
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: "Consent preferences updated successfully.",
    consentRecords: user.consentRecords,
  });
});

export {
  authUser,
  registerUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  authGoogleUser,
  renderGoogleWebLogin,
  forgotPassword,
  resetPassword,
  changePassword,
  getUserByCode,
  getUserPublicProfile,
  followUser,
  exportUserData,
  deleteUserAccount,
  updateConsentPreferences,
};
