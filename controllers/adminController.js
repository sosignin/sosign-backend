import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import Petition from "../models/petitionModel.js";
import SuccessfulPetition from "../models/successfulPetitionModel.js";
import Wallet from "../models/walletModel.js";
import Crowdfunding from "../models/crowdfundingModel.js";

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

    return res.status(200).json({ message: "Admin logged in successfully" });
  } else {
    return res.status(401).json({ message: "Invalid credentials" });
  }
};

// Get current admin
export const getCurrentAdmin = (req, res) => {
  const token = req.cookies.adminToken;
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
    console.log("🔍 Fetching users...");
    const users = await User.find({}, "name email createdAt isSuspended"); // Select name, email, createdAt, and isSuspended
    console.log(`👥 Found users: ${users.length}`);
    console.log(
      "📅 Sample user with dates:",
      JSON.stringify(
        {
          name: users[0]?.name,
          email: users[0]?.email,
          createdAt: users[0]?.createdAt,
          createdAtType: typeof users[0]?.createdAt,
        },
        null,
        2
      )
    );
    res.json(users);
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

// Get all unapproved petitions
export const getUnapprovedPetitions = async (req, res) => {
  try {
    const petitions = await Petition.find({ approved: false })
      .populate("petitionStarter.user", "name email")
      .sort({ createdAt: -1 });
    res.status(200).json({ petitions });
  } catch (error) {
    console.error("Error fetching unapproved petitions:", error);
    res.status(500).json({ message: "Error fetching unapproved petitions" });
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
    await petition.save();
    res.status(200).json({ message: "Petition approved successfully" });
  } catch (error) {
    console.error("Error approving petition:", error);
    res.status(500).json({ message: "Error approving petition" });
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
        const wallet = await Wallet.findOne({ userId: user._id });
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

