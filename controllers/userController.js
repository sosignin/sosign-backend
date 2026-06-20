import asyncHandler from "express-async-handler";
import generateToken from "../utils/generateToken.js";
import User from "../models/userModel.js";
import fetch from "node-fetch";

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
  const { name, designation, email, mobileNumber, password } = req.body;
  
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

  const user = await User.create({
    name,
    designation,
    email,
    mobileNumber,
    password,
  });

  if (user) {
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

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #F43676;">SoSign</h1>
        </div>
        <h2 style="color: #1a1a2e;">Password Reset Request</h2>
        <p style="color: #333; line-height: 1.6;">
          Hi ${user.name},
        </p>
        <p style="color: #333; line-height: 1.6;">
          You requested to reset your password. Click the button below to create a new password:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: linear-gradient(to right, #F43676, #e02a60); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          © ${new Date().getFullYear()} SoSign. All rights reserved.
        </p>
      </div>
    `;

    let emailSent = false;
    let emailError = null;

    try {
      const emailResult = await sendEmail(
        user.email,
        'Reset Your Password - SoSign',
        emailHtml,
        `Reset your password by visiting: ${resetUrl}`
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
      console.log('Password reset email sent to:', user.email);
      res.status(200).json({ message: "Password reset link has been sent to your email." });
    } else {
      console.warn("Password reset email delivery failed or skipped:", emailError);
      console.log("==================================================");
      console.log("DEVELOPMENT RESET URL:");
      console.log(resetUrl);
      console.log("==================================================");
      
      res.status(200).json({
        message: "Password reset link generated successfully.",
        resetUrl,
        warning: "Email could not be sent (SMTP not configured or failed). Use the link below."
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

export { authUser, registerUser, logoutUser, getUserProfile, updateUserProfile, authGoogleUser, forgotPassword, resetPassword, changePassword };

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

export { getUserByCode };
