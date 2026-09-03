import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import Petition from "../models/petitionModel.js";
import SuccessfulPetition from "../models/successfulPetitionModel.js";
import Wallet from "../models/walletModel.js";
import Crowdfunding from "../models/crowdfundingModel.js";
import generateUserToken from "../utils/generateToken.js";
import Plan from "../models/planModel.js";
import { triggerRevalidation } from "../utils/revalidateUtils.js";
import Notification from "../models/notificationModel.js";
import Visitor from "../models/visitorModel.js";
import Traffic from "../models/trafficModel.js";
import Blog from "../models/blogModel.js";
import AutoSignSchedule from "../models/autoSignScheduleModel.js";
import { processDueSchedules } from "../utils/autoSignScheduler.js";

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
    const users = await User.find({}, "name email mobileNumber createdAt isSuspended plan freeChecksRemaining isDummy bio aadhaarKyc panKyc voterKyc");
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

// Get all unapproved petitions (including pending updates for live petitions)
export const getUnapprovedPetitions = async (req, res) => {
  try {
    const petitions = await Petition.find({
      $or: [
        { status: "pending" },
        { approved: false },
        { hasPendingUpdates: true },
      ],
    })
      .populate("petitionStarter.user", "name email")
      .populate("motherPetition", "title slug petitionDetails.image")
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
      .populate("motherPetition", "title slug petitionDetails.image")
      .sort({ updatedAt: -1 });
    res.status(200).json({ petitions });
  } catch (error) {
    console.error("Error fetching rejected petitions:", error);
    res.status(500).json({ message: "Error fetching rejected petitions" });
  }
};

// Approve a petition or approve pending petition updates
export const approvePetition = async (req, res) => {
  try {
    const petition = await Petition.findById(req.params.id);
    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    const wasUpdate = Boolean(petition.hasPendingUpdates && petition.pendingUpdates);

    // If this petition has pending updates from petitioner, apply them now!
    if (petition.hasPendingUpdates && petition.pendingUpdates) {
      const updates = petition.pendingUpdates;
      if (updates.title !== undefined) petition.title = updates.title;
      if (updates.decisionMakers !== undefined) petition.decisionMakers = updates.decisionMakers;
      if (updates.requestedSigners !== undefined) petition.requestedSigners = updates.requestedSigners;
      if (updates.country !== undefined) petition.country = updates.country;
      if (updates.categories !== undefined) petition.categories = updates.categories;
      if (updates.petitionDetails !== undefined) petition.petitionDetails = updates.petitionDetails;
      if (updates.socialLinks !== undefined) petition.socialLinks = updates.socialLinks;
      if (updates.petitionStarter !== undefined) {
        petition.petitionStarter = {
          ...petition.petitionStarter,
          ...updates.petitionStarter,
          user: petition.petitionStarter.user, // Preserve creator
        };
      }
      if (updates.constituencySettings !== undefined) petition.constituencySettings = updates.constituencySettings;
      if (updates.signingRequirements !== undefined) petition.signingRequirements = updates.signingRequirements;

      petition.hasPendingUpdates = false;
      petition.pendingUpdates = null;
    }

    petition.approved = true;
    petition.status = "approved";
    petition.rejectionReason = undefined;
    await petition.save();

    // Create notification
    await Notification.create({
      recipient: petition.petitionStarter.user,
      title: wasUpdate ? "Petition Updates Approved" : "Petition Approved",
      message: wasUpdate
        ? `Your updates for petition "${petition.title}" have been approved and are now live!`
        : `Your petition "${petition.title}" has been approved and is now live!`,
      type: "success",
      relatedId: petition._id,
    });

    // Trigger Next.js static regeneration on-demand
    triggerRevalidation("/currentpetitions");
    triggerRevalidation(`/currentpetitions/${petition.slug}`);

    res.status(200).json({
      message: wasUpdate
        ? "Petition updates approved successfully and live changes applied"
        : "Petition approved successfully",
    });
  } catch (error) {
    console.error("Error approving petition:", error);
    res.status(500).json({ message: "Error approving petition" });
  }
};

// Reject a petition or reject pending petition updates
export const rejectPetition = async (req, res) => {
  try {
    const { reason } = req.body;
    const petition = await Petition.findById(req.params.id);
    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    // If petition is already approved and only has pending updates:
    // Reject the pending updates only, leaving the live petition intact!
    if (petition.approved && petition.hasPendingUpdates) {
      petition.hasPendingUpdates = false;
      petition.pendingUpdates = null;
      await petition.save();

      await Notification.create({
        recipient: petition.petitionStarter.user,
        title: "Petition Updates Rejected",
        message: `Your requested changes for petition "${petition.title}" were not approved (${reason || "Does not meet guidelines"}). The current version of your petition remains live.`,
        type: "error",
        relatedId: petition._id,
      });

      return res.status(200).json({
        message: "Pending updates rejected. Existing live petition remains active.",
      });
    }

    const wasAlreadyRejected = petition.status === "rejected";

    petition.approved = false;
    petition.status = "rejected";
    petition.rejectionReason = reason || "Does not meet our community guidelines.";
    await petition.save();

    // Credit back 5 points to user's wallet if not already rejected
    if (!wasAlreadyRejected && petition.petitionStarter?.user) {
      try {
        const wallet = await Wallet.getOrCreateWallet(petition.petitionStarter.user);
        if (wallet) {
          wallet.balance += 5;
          wallet.transactions.push({
            type: "credit",
            amount: 5,
            description: `Refund for rejected petition: ${petition.title}`,
          });
          await wallet.save();
        }
      } catch (walletErr) {
        console.error("Error refunding wallet points on petition rejection:", walletErr);
      }
    }

    // Create notification
    await Notification.create({
      recipient: petition.petitionStarter.user,
      title: "Petition Rejected",
      message: `Your petition "${petition.title}" was rejected. Reason: ${petition.rejectionReason}. 5 points have been credited back to your wallet.`,
      type: "error",
      relatedId: petition._id,
    });

    res.status(200).json({ message: "Petition rejected successfully and points refunded." });
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

    // Calculate website traffic metrics
    const todayDate = new Date().toISOString().split("T")[0];
    const currentMonthPrefix = todayDate.substring(0, 7);

    const trafficDoc = await Traffic.findOne({ key: "global_traffic" });
    const totalPageViews = trafficDoc?.totalPageViews || 0;

    const todayUniqueVisitors = await Visitor.countDocuments({ date: todayDate });

    const todayPageViewsResult = await Visitor.aggregate([
      { $match: { date: todayDate } },
      { $group: { _id: null, count: { $sum: "$pageViews" } } },
    ]);
    const todayPageViews = todayPageViewsResult[0]?.count || 0;

    const monthUniqueVisitorsList = await Visitor.distinct("ip", { date: { $regex: `^${currentMonthPrefix}` } });
    const monthUniqueVisitors = monthUniqueVisitorsList ? monthUniqueVisitorsList.length : 0;

    const totalUniqueVisitorsList = await Visitor.distinct("ip");
    const totalUniqueVisitors = totalUniqueVisitorsList ? totalUniqueVisitorsList.length : 0;

    // Calculate total petition & blog views
    const petitionViewsResult = await Petition.aggregate([
      { $group: { _id: null, totalViews: { $sum: "$views" } } },
    ]);
    const totalPetitionViews = petitionViewsResult[0]?.totalViews || 0;

    const blogViewsResult = await Blog.aggregate([
      { $group: { _id: null, totalViews: { $sum: "$views" } } },
    ]);
    const totalBlogViews = blogViewsResult[0]?.totalViews || 0;

    // Top viewed petitions
    const topPetitionsByViews = await Petition.find({ approved: true })
      .select("title slug views numberOfSignatures")
      .sort({ views: -1 })
      .limit(5);

    // Top viewed blogs
    const topBlogsByViews = await Blog.find({ isPublished: true })
      .select("title slug views author category")
      .sort({ views: -1 })
      .limit(5);

    const stats = {
      totalPetitions,
      totalSignatures,
      totalUsers,
      victories: successfulPetitions, // Count from SuccessfulPetition model
      traffic: {
        totalPageViews,
        todayUniqueVisitors,
        todayPageViews,
        monthUniqueVisitors,
        totalUniqueVisitors,
      },
      contentViews: {
        totalPetitionViews,
        totalBlogViews,
        totalCombinedViews: totalPetitionViews + totalBlogViews,
        topPetitions: topPetitionsByViews,
        topBlogs: topBlogsByViews,
      },
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
      "name email aadhaarKyc panKyc voterKyc mobileNumber createdAt isDummy bio"
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
      isDummy: true,
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

// Toggle/Update Banner Feature for a petition
export const toggleBannerFeature = async (req, res) => {
  try {
    const { isFeaturedInBanner, bannerOrder } = req.body;
    const petition = await Petition.findById(req.params.id);

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    if (isFeaturedInBanner !== undefined) {
      petition.isFeaturedInBanner = Boolean(isFeaturedInBanner);
    }
    if (bannerOrder !== undefined) {
      petition.bannerOrder = Number(bannerOrder);
    }

    await petition.save();

    // Trigger revalidation for homepage
    triggerRevalidation("/");
    triggerRevalidation("/currentpetitions");

    res.status(200).json({
      message: `Petition ${petition.isFeaturedInBanner ? "featured in" : "removed from"} banner slider`,
      petition,
    });
  } catch (error) {
    console.error("Error toggling banner feature:", error);
    res.status(500).json({ message: "Error updating banner feature status" });
  }
};

// Get all petitions featured in the banner slider
export const getBannerPetitions = async (req, res) => {
  try {
    const petitions = await Petition.find({ isFeaturedInBanner: true })
      .populate("petitionStarter.user", "name email profilePicture")
      .sort({ bannerOrder: 1, createdAt: -1 });

    res.status(200).json({ petitions });
  } catch (error) {
    console.error("Error fetching banner petitions:", error);
    res.status(500).json({ message: "Error fetching banner petitions" });
  }
};

// Toggle School Stall Map widget visibility for a petition
export const toggleSchoolStallMap = async (req, res) => {
  try {
    const { showSchoolStallMap } = req.body;
    const petition = await Petition.findById(req.params.id);

    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    petition.showSchoolStallMap = Boolean(showSchoolStallMap);
    await petition.save();

    res.status(200).json({
      message: `School Stall Map ${petition.showSchoolStallMap ? "enabled" : "disabled"} for this petition`,
      petition,
    });
  } catch (error) {
    console.error("Error toggling school stall map:", error);
    res.status(500).json({ message: "Error updating school stall map status" });
  }
};

// Update Petition Slug for SEO
export const updatePetitionSlug = async (req, res) => {
  try {
    const { slug } = req.body;

    if (!slug) {
      return res.status(400).json({ message: "Slug is required" });
    }

    const cleanSlug = slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!cleanSlug) {
      return res.status(400).json({ message: "Invalid slug format" });
    }

    // Check for duplicate slug
    const existingPetition = await Petition.findOne({
      slug: cleanSlug,
      _id: { $ne: req.params.id },
    });

    if (existingPetition) {
      return res.status(400).json({ message: "Slug is already used by another petition" });
    }

    const petition = await Petition.findById(req.params.id);
    if (!petition) {
      return res.status(404).json({ message: "Petition not found" });
    }

    petition.slug = cleanSlug;
    await petition.save();

    // Trigger revalidation
    triggerRevalidation("/");
    triggerRevalidation("/currentpetitions");
    triggerRevalidation(`/currentpetitions/${cleanSlug}`);

    res.status(200).json({
      success: true,
      message: "Petition SEO URL slug updated successfully",
      slug: petition.slug,
      petition,
    });
  } catch (error) {
    console.error("Error updating petition slug:", error);
    res.status(500).json({ message: "Failed to update petition slug: " + error.message });
  }
};

// @desc    Get all auto-sign schedules
// @route   GET /api/admin/auto-sign/schedules
// @access  Private/Admin
export const getAutoSignSchedules = async (req, res) => {
  try {
    const schedules = await AutoSignSchedule.find()
      .populate("petition", "title slug numberOfSignatures expectedSignatures category image")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      schedules,
    });
  } catch (error) {
    console.error("Error fetching auto-sign schedules:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new auto-sign schedule
// @route   POST /api/admin/auto-sign/schedules
// @access  Private/Admin
export const createAutoSignSchedule = async (req, res) => {
  try {
    const {
      petitionId,
      totalSignaturesTarget,
      batchSize = 5,
      intervalSeconds,
      intervalMinutes = 5,
      useSameMobile = "9999990000",
      randomJitter = true,
      startImmediately = true,
    } = req.body;

    if (!petitionId) {
      return res.status(400).json({ success: false, message: "Target petition is required" });
    }

    const petition = await Petition.findById(petitionId);
    if (!petition) {
      return res.status(404).json({ success: false, message: "Target petition not found" });
    }

    const target = parseInt(totalSignaturesTarget, 10);
    if (!target || target < 1) {
      return res.status(400).json({ success: false, message: "Total signatures target must be at least 1" });
    }

    const batch = Math.max(1, parseInt(batchSize, 10) || 5);
    let finalIntervalSeconds = parseInt(intervalSeconds, 10);
    if (!finalIntervalSeconds) {
      finalIntervalSeconds = Math.max(5, Math.round(parseFloat(intervalMinutes || 5) * 60));
    }

    const nextRunAt = startImmediately ? new Date(Date.now() + 2000) : new Date(Date.now() + finalIntervalSeconds * 1000);

    const schedule = await AutoSignSchedule.create({
      petition: petitionId,
      totalSignaturesTarget: target,
      signaturesAdded: 0,
      batchSize: batch,
      intervalSeconds: finalIntervalSeconds,
      useSameMobile: useSameMobile || "9999990000",
      randomJitter: randomJitter !== false,
      status: "running",
      nextRunAt,
      logs: [
        {
          addedCount: 0,
          timestamp: new Date(),
          currentTotal: 0,
          petitionSignatureCount: petition.numberOfSignatures || 0,
          note: `Schedule created: Target ${target} signatures in batches of ${batch} every ${finalIntervalSeconds}s`,
        },
      ],
    });

    const populated = await AutoSignSchedule.findById(schedule._id).populate("petition", "title slug numberOfSignatures");

    res.status(201).json({
      success: true,
      message: `Auto-sign schedule started for "${petition.title}"!`,
      schedule: populated,
    });
  } catch (error) {
    console.error("Error creating auto-sign schedule:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Pause an auto-sign schedule
// @route   PATCH /api/admin/auto-sign/schedules/:id/pause
// @access  Private/Admin
export const pauseAutoSignSchedule = async (req, res) => {
  try {
    const schedule = await AutoSignSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: "Schedule not found" });
    }

    schedule.status = "paused";
    await schedule.save();

    res.status(200).json({
      success: true,
      message: "Schedule paused",
      schedule,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Resume an auto-sign schedule
// @route   PATCH /api/admin/auto-sign/schedules/:id/resume
// @access  Private/Admin
export const resumeAutoSignSchedule = async (req, res) => {
  try {
    const schedule = await AutoSignSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: "Schedule not found" });
    }

    if (schedule.signaturesAdded >= schedule.totalSignaturesTarget) {
      schedule.status = "completed";
      await schedule.save();
      return res.status(400).json({ success: false, message: "Schedule has already reached its target" });
    }

    schedule.status = "running";
    schedule.nextRunAt = new Date(Date.now() + 2000); // Resume in 2s
    await schedule.save();

    res.status(200).json({
      success: true,
      message: "Schedule resumed",
      schedule,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Cancel an auto-sign schedule
// @route   PATCH /api/admin/auto-sign/schedules/:id/cancel
// @access  Private/Admin
export const cancelAutoSignSchedule = async (req, res) => {
  try {
    const schedule = await AutoSignSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: "Schedule not found" });
    }

    schedule.status = "cancelled";
    schedule.nextRunAt = null;
    await schedule.save();

    res.status(200).json({
      success: true,
      message: "Schedule cancelled",
      schedule,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete an auto-sign schedule
// @route   DELETE /api/admin/auto-sign/schedules/:id
// @access  Private/Admin
export const deleteAutoSignSchedule = async (req, res) => {
  try {
    const schedule = await AutoSignSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: "Schedule not found" });
    }

    await AutoSignSchedule.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Schedule deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Manually trigger scheduler tick (can be called by external cron or webhook)
// @route   POST /api/admin/auto-sign/tick
// @access  Private/Admin
export const triggerAutoSignTick = async (req, res) => {
  try {
    await processDueSchedules();
    res.status(200).json({
      success: true,
      message: "Scheduler heartbeat executed successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    External cron tick endpoint for cPanel Cron / Webhook
// @route   GET/POST /api/admin/auto-sign/cron-tick
// @access  Public with key (?key=sosign_cron_2026) or Private/Admin
export const handleCronTick = async (req, res) => {
  try {
    const providedKey = req.query.key || req.headers["x-cron-key"];
    const expectedKey = process.env.CRON_SECRET || "sosign_cron_2026";

    // Allow if valid cron key is provided, or if admin token is valid
    const hasValidKey = providedKey && (providedKey === expectedKey || providedKey === process.env.JWT_SECRET);

    let isAdminAuth = false;
    if (req.cookies?.token) {
      try {
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        if (decoded && decoded.email) isAdminAuth = true;
      } catch (err) {
        // Ignore cookie verification failure
      }
    }

    if (!hasValidKey && !isAdminAuth) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Please provide a valid ?key= parameter or admin session",
      });
    }

    await processDueSchedules();

    res.status(200).json({
      success: true,
      message: "Auto-sign cron tick executed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CronTick] Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Link child petition(s) to a mother petition
// @route   PUT /api/admin/petitions/link-mother-child
// @access  Private/Admin
export const linkMotherChildPetitions = async (req, res) => {
  try {
    const { motherPetitionId, childPetitionIds } = req.body;

    if (!motherPetitionId) {
      return res.status(400).json({ success: false, message: "Please select a Mother Petition" });
    }

    const childIds = Array.isArray(childPetitionIds) ? childPetitionIds : [childPetitionIds];
    const validChildIds = childIds.filter(id => Boolean(id) && id.toString() !== motherPetitionId.toString());

    if (validChildIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one valid Child Petition (cannot be the mother petition itself)"
      });
    }

    const mother = await Petition.findById(motherPetitionId);
    if (!mother) {
      return res.status(404).json({ success: false, message: "Mother petition not found" });
    }

    // Check if mother petition is currently a child of another petition
    if (mother.motherPetition) {
      return res.status(400).json({
        success: false,
        message: "This petition is already linked as a Child of another petition. A child cannot be designated as a mother petition."
      });
    }

    // Update each child petition
    let linkedCount = 0;
    const linkedTitles = [];

    for (const childId of validChildIds) {
      const child = await Petition.findById(childId);
      if (!child) continue;

      // Ensure child is not a mother with existing children (avoiding multi-level cycles)
      const isAlreadyMother = await Petition.exists({ motherPetition: childId });
      if (isAlreadyMother) {
        return res.status(400).json({
          success: false,
          message: `Petition "${child.title}" is already a Mother petition with linked sub-petitions. Multi-level nesting is not permitted.`
        });
      }

      child.motherPetition = mother._id;
      await child.save();
      linkedCount++;
      linkedTitles.push(child.title);
    }

    // Trigger revalidation for frontend pages
    triggerRevalidation("/currentpetitions");
    triggerRevalidation(`/currentpetitions/${mother.slug}`);

    res.status(200).json({
      success: true,
      message: `Successfully linked ${linkedCount} petition(s) as Child under Mother Petition "${mother.title}"`,
      mother: {
        _id: mother._id,
        title: mother.title,
        slug: mother.slug,
      },
      linkedCount,
      linkedTitles,
    });
  } catch (error) {
    console.error("Error linking mother/child petitions:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Unlink a child petition from its mother
// @route   PUT /api/admin/petitions/:id/unlink-mother
// @access  Private/Admin
export const unlinkMotherChildPetition = async (req, res) => {
  try {
    const { id } = req.params;
    const petition = await Petition.findById(id);

    if (!petition) {
      return res.status(404).json({ success: false, message: "Petition not found" });
    }

    const oldMotherId = petition.motherPetition;
    petition.motherPetition = null;
    await petition.save();

    triggerRevalidation("/currentpetitions");
    triggerRevalidation(`/currentpetitions/${petition.slug}`);

    if (oldMotherId) {
      const oldMother = await Petition.findById(oldMotherId).select("slug");
      if (oldMother?.slug) {
        triggerRevalidation(`/currentpetitions/${oldMother.slug}`);
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully unlinked "${petition.title}" from mother petition`,
    });
  } catch (error) {
    console.error("Error unlinking child petition:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all mother petitions and their child petitions + options
// @route   GET /api/admin/petitions-hierarchy/mother-child
// @access  Private/Admin
export const getMotherChildHierarchy = async (req, res) => {
  try {
    // 1. Find all active mother-child groupings
    const childGroupings = await Petition.aggregate([
      { $match: { motherPetition: { $ne: null } } },
      {
        $group: {
          _id: "$motherPetition",
          count: { $sum: 1 }
        }
      }
    ]);

    const motherIds = childGroupings.map(g => g._id);

    // Fetch mothers with their populated child documents
    const mothers = await Petition.find({ _id: { $in: motherIds } })
      .select("title slug numberOfSignatures approved country petitionStarter createdAt")
      .lean();

    const allChildren = await Petition.find({ motherPetition: { $in: motherIds } })
      .select("title slug numberOfSignatures approved country petitionStarter motherPetition createdAt")
      .lean();

    // Group children under each mother
    const clusters = mothers.map(m => {
      const children = allChildren.filter(c => c.motherPetition?.toString() === m._id.toString());
      const totalCombinedSigs = (m.numberOfSignatures || 0) + children.reduce((acc, c) => acc + (c.numberOfSignatures || 0), 0);
      return {
        ...m,
        children,
        childrenCount: children.length,
        combinedSignatures: totalCombinedSigs,
      };
    });

    // 2. Return all petitions in a lightweight list for dropdown selectors
    const allPetitions = await Petition.find()
      .select("title slug numberOfSignatures country approved motherPetition")
      .populate("motherPetition", "title")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      clusters,
      allPetitions,
    });
  } catch (error) {
    console.error("Error fetching mother-child hierarchy:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


