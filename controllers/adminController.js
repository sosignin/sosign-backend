import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import Petition from "../models/petitionModel.js";
import SuccessfulPetition from "../models/successfulPetitionModel.js";
import Wallet from "../models/walletModel.js";
import Crowdfunding from "../models/crowdfundingModel.js";
import generateUserToken from "../utils/generateToken.js";
import Plan from "../models/planModel.js";

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

// Generate JWT token
const generateToken = () => {
  return jwt.sign(
    { email: ADMIN_EMAIL, id: "admin_user_id" },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

// Admin login
export const adminLogin = (req, res) => {
  const { email, password } = req.body;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "haldarai@sosign.com";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin12345";

  if (
    email.trim() === ADMIN_EMAIL.trim() &&
    password.trim() === ADMIN_PASSWORD.trim()
  ) {
    const token = jwt.sign(
      { email: ADMIN_EMAIL, id: "admin_user_id", role: "superadmin" },
      process.env.JWT_SECRET || "default_jwt_secret_key",
      { expiresIn: "1d" }
    );

    res.cookie("adminToken", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production", // true in production, false in development
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // "none" for cross-origin in production
    });

    return res.status(200).json({
      message: "Admin logged in successfully",
      token,
      admin: { email: ADMIN_EMAIL, role: "superadmin" },
    });
  } else {
    return res.status(401).json({ message: "Invalid credentials" });
  }
};

// Get current admin
export const getCurrentAdmin = (req, res) => {
  let token = req.cookies?.adminToken;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) return res.status(401).json({ message: "Not authenticated" });

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default_jwt_secret_key"
    );
    return res.status(200).json({
      admin: {
        email: decoded.email,
        name: decoded.name || "Super Admin",
        role: decoded.role || "superadmin",
        permissions: decoded.permissions || [],
      },
    });
  } catch (error) {
    console.error("JWT verification error in getCurrentAdmin:", error);
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Admin logout
export const adminLogout = (req, res) => {
  res.cookie("adminToken", "", {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production", // true in production, false in development
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // "none" for cross-origin in production
  });

  return res.status(200).json({ message: "Admin logged out successfully" });
};

//get all users info
export const getUsers = async (req, res) => {
  try {
    console.log("🔍 Fetching users with billing data...");
    const users = await User.find({}, "name email mobileNumber createdAt isSuspended plan freeChecksRemaining");
    console.log(`👥 Found users: ${users.length}`);

    // Fetch wallet balances for all users in one query
    const wallets = await Wallet.find({ userId: { $in: users.map(u => u._id) } });
    const walletMap = {};
    wallets.forEach(w => {
      walletMap[w.userId.toString()] = w.balance;
    });

    const usersWithWallet = users.map(user => {
      const userObj = user.toObject();
      const storedBal = walletMap[user._id.toString()];
      userObj.points = storedBal !== undefined ? storedBal : ((user.plan === "free" || !user.plan) ? 20 : 0);
      return userObj;
    });

    res.json(usersWithWallet);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ message: error.message });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    console.log("Delete user request received for ID:", req.params.id);
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      console.log("User not found with ID:", id);
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndDelete(id);
    console.log("User deleted successfully:", id);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: error.message });
  }
};

// Toggle user suspension
export const toggleUserSuspension = async (req, res) => {
  try {
    const { id } = req.params;
    const { isSuspended } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isSuspended = isSuspended;
    await user.save();

    res.json({
      message: `User ${isSuspended ? "suspended" : "unsuspended"} successfully`,
      user: {
        _id: user._id,
        isSuspended: user.isSuspended,
      },
    });
  } catch (error) {
    console.error("Error toggling user suspension:", error);
    res.status(500).json({ message: error.message });
  }
};

import Notification from "../models/notificationModel.js";

// Get all unapproved petitions
export const getUnapprovedPetitions = async (req, res) => {
  try {
    const petitions = await Petition.find({
      $or: [
        { status: "pending" },
        { approved: false, status: "approved" } // Catch re-edited petitions
      ]
    })
      .populate("petitionStarter.user", "name email")
      .sort({ updatedAt: -1, createdAt: -1 });
    res.status(200).json({ petitions });
  } catch (error) {
    console.error("Error fetching unapproved petitions:", error);
    res.status(500).json({ message: "Error fetching unapproved petitions" });
  }
};

// Get all rejected petitions (history)
export const getRejectedPetitions = async (req, res) => {
  try {
    const petitions = await Petition.find({ status: "rejected" })
      .populate("petitionStarter.user", "name email")
      .sort({ updatedAt: -1 });
    res.status(200).json({ petitions });
  } catch (error) {
    console.error("Error fetching rejected petitions:", error);
    res.status(500).json({ message: "Error fetching rejected petitions" });
  }
};

// Approve a petition
export const approvePetition = async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id);
    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }
    petition.approved = true;
    petition.status = "approved";
    await petition.save();

    // Create notification
    await Notification.create({
      recipient: petition.petitionStarter.user,
      title: "Petition Approved",
      message: `Your petition "${petition.title}" has been approved and is now live!`,
      type: "success",
      relatedId: petition._id,
    });

    res.status(200).json({ message: "Petition approved successfully" });
  } catch (error) {
    console.error("Error approving petition:", error);
    res.status(500).json({ message: "Error approving petition" });
  }
};

// Reject a petition
export const rejectPetition = async (req, res) => {
  try {
    const { reason } = req.body;
    const petition = await Petition.findById(req.params.id);
    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    petition.approved = false;
    petition.status = "rejected";
    petition.rejectionReason = reason || "Does not meet our community guidelines.";
    await petition.save();

    // Create notification
    await Notification.create({
      recipient: petition.petitionStarter.user,
      title: "Petition Rejected",
      message: `Your petition "${petition.title}" was rejected. Reason: ${petition.rejectionReason}`,
      type: "error",
      relatedId: petition._id,
    });

    res.status(200).json({ message: "Petition rejected successfully" });
  } catch (error) {
    console.error("Error rejecting petition:", error);
    res.status(500).json({ message: "Error rejecting petition" });
  }
};

// Reset petition to pending
export const resetPetition = async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id);
    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    petition.status = "pending";
    petition.approved = false;
    petition.rejectionReason = undefined;
    await petition.save();

    res.status(200).json({ message: "Petition reset to pending" });
  } catch (error) {
    console.error("Error resetting petition:", error);
    res.status(500).json({ message: "Error resetting petition" });
  }
};

// Get admin dashboard statistics
export const getAdminStats = async (req, res) => {
  try {
    // Get total counts
    const totalPetitions = await Petition.countDocuments();
    const totalUsers = await User.countDocuments();

    // Calculate total signatures from all petitions
    const petitionSignatures = await Petition.aggregate([
      { $group: { _id: null, totalSignatures: { $sum: "$numberOfSignatures" } } },
    ]);
    const totalSignatures = petitionSignatures[0]?.totalSignatures || 0;

    // Get active (approved) petitions count
    const activePetitions = await Petition.countDocuments({ approved: true });

    // Get successful petitions count from SuccessfulPetition model
    const successfulPetitions = await SuccessfulPetition.countDocuments();

    // Calculate signatures breakdown
    const activeSignaturesResult = await Petition.aggregate([
      { $match: { approved: true } },
      { $group: { _id: null, totalSignatures: { $sum: "$numberOfSignatures" } } },
    ]);
    const activeSignatures = activeSignaturesResult[0]?.totalSignatures || 0;

    // Get total signatures from successful petitions
    const successfulSignaturesResult = await SuccessfulPetition.aggregate([
      { $group: { _id: null, totalSignatures: { $sum: "$totalSignatures" } } },
    ]);
    const successfulSignatures =
      successfulSignaturesResult[0]?.totalSignatures || 0;

    // Get crowdfunding stats
    const totalCrowdfunding = await Crowdfunding.countDocuments();
    const activeCrowdfunding = await Crowdfunding.countDocuments({ approved: true });
    const crowdfundingResult = await Crowdfunding.aggregate([
      { $group: { _id: null, totalRaised: { $sum: "$raisedAmount" } } },
    ]);
    const totalRaised = crowdfundingResult[0]?.totalRaised || 0;

    // Get recent activity (petitions created in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentPetitions = await Petition.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    const recentSuccessfulPetitions = await SuccessfulPetition.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    const stats = {
      totalPetitions,
      totalSignatures,
      totalUsers,
      victories: successfulPetitions, // Count from SuccessfulPetition model
      breakdown: {
        activePetitions,
        successfulPetitions,
        activeSignatures,
        successfulSignatures,
      },
      crowdfunding: {
        total: totalCrowdfunding,
        active: activeCrowdfunding,
        totalRaised: totalRaised,
      },
      recentActivity: recentPetitions + recentSuccessfulPetitions,
    };

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching statistics",
    });
  }
};

// @desc    Get all user wallets
// @route   GET /api/admin/wallets
// @access  Private/Admin
export const getWallets = async (req, res) => {
  try {
    const users = await User.find({}, "name email");

    // Fetch wallet for each user
    const userWallets = await Promise.all(
      users.map(async (user) => {
        const wallet = await Wallet.getOrCreateWallet(user._id);
        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          balance: wallet ? wallet.balance : 0,
        };
      })
    );

    res.status(200).json({
      success: true,
      wallets: userWallets,
    });
  } catch (error) {
    console.error("Error fetching wallets:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user wallets",
    });
  }
};
// @desc    Get all users who have verified their Aadhaar using DigiLocker
// @route   GET /api/admin/verified-users
// @access  Private/Admin
export const getVerifiedUsers = async (req, res) => {
  try {
    const users = await User.find(
      {
        $or: [
          { "aadhaarKyc.status": "verified" },
          { "panKyc.status": "verified" },
          { "voterKyc.status": "verified" }
        ]
      },
      "name email aadhaarKyc panKyc voterKyc mobileNumber createdAt"
    ).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error fetching verified users:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a dummy user bypassing normal checks
// @route   POST /api/admin/dummy/user
// @access  Private/Admin
export const createDummyUser = async (req, res) => {
  try {
    const { name, email, mobileNumber, designation, bio, verifyAadhaar } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Name and email are required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: "A user with this email already exists" });
    }

    const dummyUser = await User.create({
      name,
      email,
      mobileNumber: mobileNumber || undefined,
      designation: designation || "Citizen",
      bio: bio || "Dummy account for petition operations",
      password: "dummy_password_12345", // dummy password
      aadhaarKyc: verifyAadhaar ? {
        status: "verified",
        maskedAadhaar: "XXXX-XXXX-" + Math.floor(1000 + Math.random() * 9000),
        name,
        dob: "01/01/1990",
        address: "SoSign Hub, India",
        state: "Delhi",
        pincode: "110001",
        verifiedAt: new Date()
      } : { status: "not_verified" }
    });

    res.status(201).json({
      success: true,
      message: "Dummy user created successfully",
      user: dummyUser
    });
  } catch (error) {
    console.error("Error creating dummy user:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a dummy petition
// @route   POST /api/admin/dummy/petition
// @access  Private/Admin
export const createDummyPetition = async (req, res) => {
  try {
    const { 
      title, 
      userId, 
      problem, 
      solution, 
      category, 
      decisionMakers, 
      images, 
      signingRequirements 
    } = req.body;

    if (!title || !userId || !problem || !solution) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Starter user not found" });
    }

    const formattedDecisionMakers = (decisionMakers || []).map(dm => ({
      name: dm.name,
      organization: dm.organization || "",
      email: dm.email || "",
      phone: dm.phone || ""
    }));

    const petition = await Petition.create({
      title,
      country: "India",
      categories: category ? [category] : ["General"],
      decisionMakers: formattedDecisionMakers,
      petitionDetails: {
        problem,
        solution,
        images: images && images.length > 0 ? images : ["https://images.unsplash.com/photo-1541872703-74c5e44368f9?q=80&w=1400"],
        image: images && images.length > 0 ? images[0] : "https://images.unsplash.com/photo-1541872703-74c5e44368f9?q=80&w=1400"
      },
      petitionStarter: {
        user: user._id,
        name: user.name,
        mobile: user.mobileNumber || "9999999999",
        aadharNumber: user.aadhaarKyc?.maskedAadhaar || "XXXX-XXXX-1234"
      },
      signingRequirements: signingRequirements || {
        constituency: { required: false },
        aadhar: { required: false }
      },
      status: "approved",
      approved: true
    });

    // Link petition to starter user
    user.petitions.push(petition._id);
    await user.save();

    res.status(201).json({
      success: true,
      message: "Dummy petition created and approved successfully",
      petition
    });
  } catch (error) {
    console.error("Error creating dummy petition:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add bulk dummy signatures to a petition
// @route   POST /api/admin/dummy/sign
// @access  Private/Admin
export const addDummySignatures = async (req, res) => {
  try {
    const { petitionId, count, useSameMobile } = req.body;

    if (!petitionId || !count) {
      return res.status(400).json({ success: false, message: "Petition ID and count are required" });
    }

    const petition = await Petition.findById(petitionId);
    if (!petition) {
      return res.status(404).json({ success: false, message: "Petition not found" });
    }

    const firstNames = ["Amit", "Rahul", "Priya", "Sneha", "Rajesh", "Vikram", "Neha", "Anjali", "Sanjay", "Deepak", "Aarav", "Vihaan", "Aditya", "Sai", "Ishaan", "Arjun", "Kabir", "Rohan", "Meera", "Kavya", "Diya", "Riya", "Aanya", "Prisha"];
    const lastNames = ["Sharma", "Kumar", "Singh", "Patel", "Mehta", "Joshi", "Verma", "Gupta", "Nair", "Iyer", "Reddy", "Rao", "Haldar", "Choudhury", "Das", "Banerjee", "Sen", "Roy", "Shah"];

    const signaturesToAdd = [];
    const mobileToUse = useSameMobile || "9999990000";

    for (let i = 0; i < count; i++) {
      const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const name = `${fName} ${lName}`;
      
      const uniqueSuffix = Math.floor(100000 + Math.random() * 900000);
      const emailDomains = [
        "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "protonmail.com",
        "rediffmail.com", "zoho.com", "icloud.com", "mail.com", "yandex.com",
        "aol.com", "fastmail.com", "tutanota.com", "inbox.com", "live.com"
      ];
      const randomDomain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
      const cleanName = `${fName}${lName}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      const email = `${cleanName}${uniqueSuffix}@${randomDomain}`;

      // Create a dummy user for the signature record
      const dummyUser = await User.create({
        name,
        email,
        mobileNumber: mobileToUse, // duplicate mobile allowed now!
        designation: "Supporter",
        bio: "Citizen supporter",
        password: "dummy_password_12345",
        aadhaarKyc: {
          status: "verified",
          maskedAadhaar: "XXXX-XXXX-" + Math.floor(1000 + Math.random() * 9000),
          name,
          dob: "01/01/1990",
          address: "SoSign Hub, India",
          state: "Delhi",
          pincode: "110001",
          verifiedAt: new Date()
        }
      });

      signaturesToAdd.push({
        user: dummyUser._id,
        signedAt: new Date()
      });
    }

    // Add to petition
    petition.signatures.push(...signaturesToAdd);
    petition.numberOfSignatures = (petition.numberOfSignatures || 0) + count;
    await petition.save();

    res.status(200).json({
      success: true,
      message: `Successfully added ${count} dummy signatures to petition`,
      newSignatureCount: petition.numberOfSignatures
    });
  } catch (error) {
    console.error("Error adding dummy signatures:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset Aadhaar, PAN, and/or Voter ID verification for a user (for testing purposes)
// @route   POST /api/admin/reset-kyc
// @access  Private/Admin
export const resetUserKyc = async (req, res) => {
  try {
    const { userId, type } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Reset specific KYC type or all if no type specified
    let resetLabel = "";
    if (type === "aadhaar") {
      user.aadhaarKyc = { status: "not_verified" };
      resetLabel = "Aadhaar";
    } else if (type === "pan") {
      user.panKyc = { status: "not_verified" };
      resetLabel = "PAN";
    } else if (type === "voter") {
      user.voterKyc = { status: "not_verified" };
      resetLabel = "Voter ID";
    } else {
      // Reset all
      user.aadhaarKyc = { status: "not_verified" };
      user.panKyc = { status: "not_verified" };
      user.voterKyc = { status: "not_verified" };
      resetLabel = "All KYC";
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: `${resetLabel} verification for user ${user.name} has been reset successfully`,
    });
  } catch (error) {
    console.error("Error resetting user KYC:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update or reset a user's mobile number
// @route   PUT /api/admin/customers/:id/mobile
// @access  Private/Admin
export const updateUserMobile = async (req, res) => {
  try {
    const { id } = req.params;
    const { mobileNumber } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // If mobileNumber is empty/null, reset it (clear the field)
    if (!mobileNumber || mobileNumber.trim() === "") {
      user.mobileNumber = undefined;
      await user.save();
      return res.status(200).json({
        success: true,
        message: `Mobile number for ${user.name} has been reset successfully`,
        user: { _id: user._id, mobileNumber: null },
      });
    }

    // Validate mobile number format (10-digit Indian number)
    const cleanNumber = mobileNumber.trim();
    if (!/^\d{10}$/.test(cleanNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number. Please enter a valid 10-digit number.",
      });
    }

    user.mobileNumber = cleanNumber;
    await user.save();

    res.status(200).json({
      success: true,
      message: `Mobile number for ${user.name} has been updated to ${cleanNumber}`,
      user: { _id: user._id, mobileNumber: cleanNumber },
    });
  } catch (error) {
    console.error("Error updating user mobile:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a user's name
// @route   PUT /api/admin/customers/:id/name
// @access  Private/Admin
export const updateUserName = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Name cannot be empty.",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const oldName = user.name;
    user.name = name.trim();
    await user.save();

    res.status(200).json({
      success: true,
      message: `User name updated from "${oldName}" to "${user.name}"`,
      user: { _id: user._id, name: user.name },
    });
  } catch (error) {
    console.error("Error updating user name:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Impersonate a user (generate login token)
// @route   POST /api/admin/customers/:id/login-as
// @access  Private/Admin
export const loginAsUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const token = generateUserToken(res, user._id);

    res.status(200).json({
      success: true,
      message: `Login token generated for ${user.name}`,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      }
    });
  } catch (error) {
    console.error("Error in loginAsUser:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user plan, free checks, and wallet points
// @route   PUT /api/admin/customers/:id/plan
// @access  Private/Admin
export const updateUserPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { plan, freeChecksRemaining, points } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (plan !== undefined) {
      const activePlans = await Plan.find({});
      const allowedPlans = ["free", ...activePlans.map(p => p.key)];
      if (!allowedPlans.includes(plan)) {
        return res.status(400).json({ success: false, message: "Invalid plan tier" });
      }
      user.plan = plan;
    }

    if (freeChecksRemaining !== undefined) {
      const val = parseInt(freeChecksRemaining);
      if (isNaN(val) || val < 0) {
        return res.status(400).json({ success: false, message: "Invalid free checks count" });
      }
      user.freeChecksRemaining = val;
    }

    await user.save();

    // If points are provided, update their wallet
    let walletBalance = 0;
    if (points !== undefined) {
      const ptsVal = parseFloat(points);
      if (isNaN(ptsVal) || ptsVal < 0) {
        return res.status(400).json({ success: false, message: "Invalid points amount" });
      }
      const wallet = await Wallet.getOrCreateWallet(user._id);
      const diff = ptsVal - wallet.balance;
      if (diff !== 0) {
        wallet.balance = ptsVal;
        wallet.transactions.push({
          type: diff > 0 ? "credit" : "debit",
          amount: Math.abs(diff),
          description: `Manual adjustment by administrator`,
        });
        await wallet.save();
      }
      walletBalance = wallet.balance;
    } else {
      const wallet = await Wallet.findOne({ userId: user._id });
      walletBalance = wallet ? wallet.balance : 0;
    }

    res.status(200).json({
      success: true,
      message: "User plan and points updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        freeChecksRemaining: user.freeChecksRemaining,
        points: walletBalance,
      },
    });
  } catch (error) {
    console.error("Error updating user plan:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
