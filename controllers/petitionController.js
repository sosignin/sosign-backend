import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import Petition from "../models/petitionModel.js";
import PetitionView from "../models/petitionViewModel.js";
import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import SuccessfulPetition from "../models/successfulPetitionModel.js";
import cloudinary from "../config/cloudinary.js";
import { sendPetitionNotificationEmails } from "../config/emailConfig.js";
import createAdminNotification from "../utils/adminNotifier.js";
import {
  normalizeAadhaarNumber,
  isValidAadhaarNumber,
  hashAadhaarNumber,
  verifyAadhaarVerificationToken,
} from "../utils/aadhaarVerificationUtils.js";
import {
  isValidPanNumber,
  hashPanNumber,
  verifyPanVerificationToken,
} from "../utils/panVerificationUtils.js";
import {
  isValidVoterNumber,
  hashVoterNumber,
  verifyVoterVerificationToken,
} from "../utils/voterVerificationUtils.js";
import { checkAbusiveContent } from "../utils/abusiveWords.js";
import { triggerRevalidation } from "../utils/revalidateUtils.js";

// @desc    Create a new petition
// @route   POST /api/petitions
// @access  Private
const createPetition = asyncHandler(async (req, res) => {
  const {
    title,
    decisionMakers,
    requestedSigners,
    country,
    petitionDetails,
    petitionStarter,
    categories,
    constituencySettings,
    signingRequirements,
    socialLinks,
    motherPetition,
    aadhaarVerificationToken,
    aadharVerificationToken,
    panVerificationToken,
    voterVerificationToken,
  } = req.body;

  // Parse requestedSigners if it's a string (from FormData)
  let parsedRequestedSigners = requestedSigners || [];
  if (typeof requestedSigners === "string") {
    try {
      parsedRequestedSigners = JSON.parse(requestedSigners);
    } catch (error) {
      res.status(400);
      throw new Error("Invalid requested signers data format");
    }
  }

  // Parse decisionMakers if it's a string (from FormData)
  let parsedDecisionMakers = decisionMakers;
  if (typeof decisionMakers === "string") {
    try {
      parsedDecisionMakers = JSON.parse(decisionMakers);
    } catch (error) {
      res.status(400);
      throw new Error("Invalid decision makers data format");
    }
  }

  // Parse petitionDetails if it's a string (from FormData)
  let parsedPetitionDetails = petitionDetails;
  if (typeof petitionDetails === "string") {
    try {
      parsedPetitionDetails = JSON.parse(petitionDetails);
    } catch (error) {
      res.status(400);
      throw new Error("Invalid petition details data format");
    }
  }

  // Parse petitionStarter if it's a string (from FormData)
  let parsedPetitionStarter = petitionStarter;
  if (typeof petitionStarter === "string") {
    try {
      parsedPetitionStarter = JSON.parse(petitionStarter);
    } catch (error) {
      res.status(400);
      throw new Error("Invalid petition starter data format");
    }
  }

  // Parse categories if it's a string (from FormData)
  let parsedCategories = categories || [];
  if (typeof categories === "string") {
    try {
      parsedCategories = JSON.parse(categories);
    } catch (error) {
      res.status(400);
      throw new Error("Invalid categories data format");
    }
  }

  // Parse constituencySettings if it's a string (from FormData) - Keep for backward compatibility
  let parsedConstituencySettings = constituencySettings || { required: false };
  if (typeof constituencySettings === "string") {
    try {
      parsedConstituencySettings = JSON.parse(constituencySettings);
    } catch (error) {
      res.status(400);
      throw new Error("Invalid constituency settings data format");
    }
  }

  // Parse signingRequirements if it's a string (from FormData)
  let parsedSigningRequirements = signingRequirements || {
    constituency: { required: false, allowedConstituency: undefined },
    aadhar: { required: false },
  };
  if (typeof signingRequirements === "string") {
    try {
      parsedSigningRequirements = JSON.parse(signingRequirements);
    } catch (error) {
      res.status(400);
      throw new Error("Invalid signing requirements data format");
    }
  }

  // Parse socialLinks if it's a string (from FormData)
  let parsedSocialLinks = socialLinks || {};
  if (typeof socialLinks === "string") {
    try {
      parsedSocialLinks = JSON.parse(socialLinks);
    } catch (error) {
      // Fallback
    }
  }

  // Validate required fields
  if (
    !title ||
    !country ||
    !parsedPetitionDetails?.problem ||
    !parsedPetitionDetails?.solution ||
    !parsedPetitionStarter
  ) {
    res.status(400);
    throw new Error("Please provide all required fields");
  }

  // Abusive words validation
  const fullTextToCheck = [
    title,
    parsedPetitionDetails?.problem,
    parsedPetitionDetails?.solution,
    parsedPetitionStarter?.comment,
  ].filter(Boolean).join(" ");

  const abusiveCheck = checkAbusiveContent(fullTextToCheck);
  if (abusiveCheck.hasAbusive) {
    res.status(400);
    throw new Error(abusiveCheck.warning);
  }

  // Handle authentication - create temporary user if not authenticated
  let userId;
  console.log("req.user in createPetition:", req.user); // Debugging line
  if (req.user && req.user._id) {
    // User is authenticated
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    // Unify point checking/deduction for both free and paid plans
    const wallet = await Wallet.getOrCreateWallet(user._id);
    if (wallet.balance < 5) {
      res.status(400);
      throw new Error("Insufficient wallet balance. Creating a petition requires 5 points.");
    }

    if (user.plan === "free" || user.plan === "none" || !user.plan) {
      const petitionCount = await Petition.countDocuments({ userId: user._id });
      if (petitionCount >= 1) {
        res.status(400);
        throw new Error("Users on the free plan can only create 1 petition. Please upgrade to a paid tier (Bronze, Silver, Gold, or Platinum) to create more.");
      }
    }

    wallet.balance -= 5;
    wallet.transactions.push({
      type: "debit",
      amount: 5,
      description: "Petition creation charges",
    });
    await wallet.save();

    userId = req.user._id;
    console.log("Using authenticated user ID:", userId); // Debugging line
  } else {
    // User is not authenticated - create a temporary user if req.user is undefined
    // In production, this should be removed and proper authentication enforced
    const tempUser = await User.findOne({ email: "temp@example.com" });
    if (tempUser) {
      userId = tempUser._id;
    } else {
      // Create a temporary user with unique mobile number
      const newTempUser = await User.create({
        name: "Temporary User",
        email: "temp@example.com",
        password: "temppassword123", // This will be hashed by the model
        designation: "Citizen",
        mobileNumber: `+1${Date.now()}`, // Unique mobile number based on timestamp
      });
      userId = newTempUser._id;
    }
  }
  console.log("Derived userId for petition creation:", userId); // Debugging line
  console.log("parsedPetitionStarter before creation:", parsedPetitionStarter); // Debugging line

  // Enforce identity verification for petition creator (Aadhaar, PAN Card, or Voter ID).
  const isAadhaarAlreadyVerified = req.user?.aadhaarKyc?.status === "verified";
  const isPanAlreadyVerified = req.user?.panKyc?.status === "verified";
  const isVoterAlreadyVerified = req.user?.voterKyc?.status === "verified";

  let isAadhaarVerified = isAadhaarAlreadyVerified;
  let isPanVerified = isPanAlreadyVerified;
  let isVoterVerified = isVoterAlreadyVerified;

  const starterAadhaarRaw =
    parsedPetitionStarter?.aadharNumber || parsedPetitionStarter?.aadhaarNumber;
  const normalizedStarterAadhaar = normalizeAadhaarNumber(starterAadhaarRaw);
  const starterPanRaw = parsedPetitionStarter?.panNumber;
  const normalizedStarterPan = starterPanRaw ? starterPanRaw.trim().toUpperCase() : "";
  const starterVoterRaw = parsedPetitionStarter?.voterNumber;
  const normalizedStarterVoter = starterVoterRaw ? starterVoterRaw.trim().toUpperCase() : "";

  const aadhaarToken = (aadhaarVerificationToken || aadharVerificationToken || "").trim();
  const panToken = (panVerificationToken || "").trim();
  const voterToken = (voterVerificationToken || "").trim();

  // Validate Aadhaar Token if passed
  if (!isAadhaarVerified && aadhaarToken) {
    if (isValidAadhaarNumber(normalizedStarterAadhaar)) {
      try {
        const decodedToken = verifyAadhaarVerificationToken(aadhaarToken);
        if (
          decodedToken.userId === userId.toString() &&
          decodedToken.aadhaarHash === hashAadhaarNumber(normalizedStarterAadhaar)
        ) {
          isAadhaarVerified = true;
        }
      } catch (error) {
        // Token invalid or expired
      }
    }
  }

  // Validate PAN Token if passed
  if (!isPanVerified && panToken) {
    if (isValidPanNumber(normalizedStarterPan)) {
      try {
        const decodedToken = verifyPanVerificationToken(panToken);
        if (
          decodedToken.userId === userId.toString() &&
          decodedToken.panHash === hashPanNumber(normalizedStarterPan)
        ) {
          isPanVerified = true;
        }
      } catch (error) {
        // Token invalid or expired
      }
    }
  }

  // Validate Voter Token if passed
  if (!isVoterVerified && voterToken) {
    if (isValidVoterNumber(normalizedStarterVoter)) {
      try {
        const decodedToken = verifyVoterVerificationToken(voterToken);
        if (
          decodedToken.userId === userId.toString() &&
          decodedToken.voterHash === hashVoterNumber(normalizedStarterVoter)
        ) {
          isVoterVerified = true;
        }
      } catch (error) {
        // Token invalid or expired
      }
    }
  }

  const hasAtLeastOneVerification = isAadhaarVerified || isPanVerified || isVoterVerified;

  if (!hasAtLeastOneVerification) {
    res.status(400);
    throw new Error(
      "Identity verification required: Please complete Aadhaar KYC, PAN Card, or Voter ID verification before creating a petition."
    );
  }

  parsedPetitionStarter = {
    ...parsedPetitionStarter,
    aadharNumber: isAadhaarAlreadyVerified && !isValidAadhaarNumber(normalizedStarterAadhaar) 
      ? (req.user.aadhaarKyc.maskedAadhaar || normalizedStarterAadhaar)
      : normalizedStarterAadhaar,
    panNumber: isPanAlreadyVerified && !isValidPanNumber(normalizedStarterPan)
      ? (req.user.panKyc.panNumber || normalizedStarterPan)
      : normalizedStarterPan,
    voterNumber: isVoterAlreadyVerified && !isValidVoterNumber(normalizedStarterVoter)
      ? (req.user.voterKyc.voterId || normalizedStarterVoter)
      : normalizedStarterVoter,
  };

  // Handle multiple image uploads to Cloudinary if files are present
  let imageUrls = [];
  let primaryImageUrl = "";
  
  if (req.files && req.files.length > 0) {
    try {
      imageUrls = req.files.map(file => file.path); // Array of Cloudinary URLs
      primaryImageUrl = imageUrls[0]; // Set first image as primary
    } catch (error) {
      res.status(500);
      throw new Error("Image upload failed");
    }
  }

  const petition = await Petition.create({
    title,
    decisionMakers: parsedDecisionMakers || [],
    requestedSigners: parsedRequestedSigners || [],
    country,
    categories: parsedCategories,
    petitionDetails: {
      ...parsedPetitionDetails,
      image: primaryImageUrl,
      images: imageUrls,
    },
    petitionStarter: {
      ...parsedPetitionStarter,
      user: userId,
    },
    constituencySettings: parsedConstituencySettings,
    signingRequirements: parsedSigningRequirements,
    socialLinks: parsedSocialLinks,
    motherPetition: motherPetition || null,
    approved: false, // Explicitly set to false for approval workflow
  });

  // Link the petition to the user
  if (userId) {
    console.log("Attempting to link petition to user:", userId);
    const user = await User.findById(userId);
    if (user) {
      user.petitions.push(petition._id);
      await user.save();
      console.log(
        "Petition linked successfully. User petitions:",
        user.petitions,
      );
    } else {
      console.log("User not found when attempting to link petition.", userId);
    }
  }

  if (petition) {
    // Send email notifications to decision makers (async, don't wait for completion)
    console.log("🔍 Checking decision makers for email sending...");
    console.log("Decision makers:", petition.decisionMakers);
    console.log(
      "Decision makers length:",
      petition.decisionMakers ? petition.decisionMakers.length : 0,
    );

    if (petition.decisionMakers && petition.decisionMakers.length > 0) {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      console.log("📧 Starting email notification process...");
      console.log("Frontend URL:", frontendUrl);

      // Send emails asynchronously (don't block the response)
      sendPetitionNotificationEmails(petition, frontendUrl)
        .then((emailResult) => {
          if (emailResult.success) {
            console.log(
              `✅ Email notifications sent: ${emailResult.totalSent} successful, ${emailResult.totalFailed} failed`,
            );
            console.log("📋 Email results:", emailResult.results);
          } else {
            console.error(
              "❌ Failed to send email notifications:",
              emailResult.error,
            );
          }
        })
        .catch((error) => {
          console.error("💥 Error in email notification process:", error);
        });
    } else {
      console.log(
        "⚠️ No decision makers found or decision makers array is empty",
      );
    }

    // Trigger Admin Notification
    createAdminNotification({
      category: "petition_approval",
      title: "New Petition for Approval",
      message: `Petition "${petition.title}" submitted by ${petition.petitionStarter?.name || "User"}`,
      link: "/dashboard/petition-approval",
      relatedId: petition._id,
      meta: {
        petitionTitle: petition.title,
        petitionerName: petition.petitionStarter?.name,
        country: petition.country,
      },
    });

    res.status(201).json({
      success: true,
      message: "Petition created successfully",
      petition: {
        _id: petition._id,
        slug: petition.slug,
        title: petition.title,
        decisionMakers: petition.decisionMakers,
        country: petition.country,
        categories: petition.categories,
        petitionDetails: petition.petitionDetails,
        petitionStarter: petition.petitionStarter,
        numberOfSignatures: petition.numberOfSignatures,
        createdAt: petition.createdAt,
        updatedAt: petition.updatedAt,
      },
    });
  } else {
    res.status(400);
    throw new Error("Invalid petition data");
  }
});

// @desc    Get all petitions
// @route   GET /api/petitions
// @access  Public
const getPetitions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const { country, search, category, sort } = req.query;

  // Build query object
  let query = {};

  if (country) {
    query.country = country;
  }

  if (category) {
    // Match categories case-insensitively, handling spaces, underscores, and hyphens interchangeably.
    // Escape special regex characters to prevent regex injection.
    const escapedCategory = category.trim().replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
    const regexPattern = escapedCategory.replace(/[-\s_]+/g, "[-\\s_]*");
    query.categories = { $regex: new RegExp(`^${regexPattern}$`, "i") };
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { "petitionDetails.problem": { $regex: search, $options: "i" } },
      { "petitionDetails.solution": { $regex: search, $options: "i" } },
    ];
  }

  // Only fetch approved petitions that are not hidden
  query.approved = true;
  query.hidden = { $ne: true };

  // Build sort object
  let sortOption = { isFeaturedInBanner: -1, bannerOrder: 1, createdAt: -1 };
  if (sort === "signatures" || sort === "popular" || sort === "trending") {
    sortOption = { numberOfSignatures: -1, createdAt: -1 };
  } else if (sort === "oldest") {
    sortOption = { createdAt: 1 };
  } else if (sort === "newest") {
    sortOption = { createdAt: -1 };
  }

  // Run count and find in parallel
  const [petitions, totalPetitions] = await Promise.all([
    Petition.find(query)
      .select("-signatures") // Exclude heavy signatures array
      .populate("petitionStarter.user", "name email designation profilePicture")
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean(), // Convert to plain JS objects for performance
    Petition.countDocuments(query),
  ]);

  res.status(200).json({
    petitions,
    currentPage: page,
    totalPages: Math.ceil(totalPetitions / limit),
    totalPetitions,
    hasNextPage: page < Math.ceil(totalPetitions / limit),
    hasPrevPage: page > 1,
  });
});

// @desc    Get all petitions for admin (including unapproved)
// @route   GET /api/admin/petitions (admin only)
// @access  Private/Admin
const getAllPetitionsForAdmin = asyncHandler(async (req, res) => {
  const isAll = req.query.all === "true" || req.query.limit === "all" || req.query.limit === "0";
  const page = parseInt(req.query.page) || 1;
  const limit = isAll ? 0 : (parseInt(req.query.limit) || 10);
  const skip = isAll ? 0 : (page - 1) * limit;

  const { country, search } = req.query;

  // Build query object
  let query = {};

  if (country) {
    query.country = country;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { "petitionDetails.problem": { $regex: search, $options: "i" } },
      { "petitionDetails.solution": { $regex: search, $options: "i" } },
    ];
  }

  // Admin sees ALL petitions (approved and unapproved)
  let findQuery = Petition.find(query)
    .select(
      "-signatures -petitionStarter.location -petitionStarter.mobile -petitionStarter.aadharNumber -petitionStarter.panNumber -petitionStarter.voterNumber -petitionStarter.pincode -petitionStarter.mpConstituencyNumber -petitionStarter.mlaConstituencyNumber"
    )
    .populate("petitionStarter.user", "name email designation profilePicture")
    .populate("motherPetition", "title slug numberOfSignatures")
    .sort({ createdAt: -1 });

  if (!isAll) {
    findQuery = findQuery.skip(skip).limit(limit);
  }

  const [rawPetitions, totalPetitions, childCounts] = await Promise.all([
    findQuery.lean(),
    Petition.countDocuments(query),
    Petition.aggregate([
      { $match: { motherPetition: { $ne: null } } },
      { $group: { _id: "$motherPetition", count: { $sum: 1 } } }
    ])
  ]);

  const childCountMap = {};
  childCounts.forEach(c => {
    if (c._id) childCountMap[c._id.toString()] = c.count;
  });

  const petitions = rawPetitions.map(p => ({
    ...p,
    subPetitionsCount: childCountMap[p._id.toString()] || 0
  }));

  res.status(200).json({
    petitions,
    currentPage: isAll ? 1 : page,
    totalPages: isAll ? 1 : Math.ceil(totalPetitions / (limit || 1)),
    totalPetitions,
    hasNextPage: isAll ? false : page < Math.ceil(totalPetitions / (limit || 1)),
    hasPrevPage: isAll ? false : page > 1,
  });
});

// @desc    Get petition by ID or slug
// @route   GET /api/petitions/:id
// @access  Public
const getPetitionById = asyncHandler(async (req, res) => {
  const idOrSlug = req.params.id;

  // Check if the param is a valid MongoDB ObjectId
  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);

  let petition;

  if (isValidObjectId) {
    // Try to find by ID first
    petition = await Petition.findById(idOrSlug)
      .populate(
        "petitionStarter.user",
        "name email designation uniqueCode profilePicture socialLinks",
      )
      .populate("motherPetition", "title slug petitionDetails.image numberOfSignatures approved hidden")
      .select({ signatures: { $slice: -20 } })
      .populate("signatures.user", "name email uniqueCode designation profilePicture")
      .populate("signatures.referral.owner", "name email uniqueCode");
  }

  // If not found by ID, try to find by slug
  if (!petition) {
    petition = await Petition.findOne({ slug: idOrSlug })
      .populate(
        "petitionStarter.user",
        "name email designation uniqueCode profilePicture socialLinks",
      )
      .populate("motherPetition", "title slug petitionDetails.image numberOfSignatures approved hidden")
      .select({ signatures: { $slice: -20 } })
      .populate("signatures.user", "name email uniqueCode designation profilePicture")
      .populate("signatures.referral.owner", "name email uniqueCode");
  }

  if (petition) {
    // Find notable signers (Celebrities, Politicians, NGOs, etc.)
    // We search across ALL signatures for this petition
    const notableKeywords = [
      "Politician", "MP", "MLA", "Minister", "Chief Minister", "CM", "PM", "Prime Minister",
      "NGO", "Foundation", "Trust", "Political Party", "Social Worker", "Activists", "Activist",
      "Influencer", "Actor", "Celebrity", "Artist", "Chairman", "President", "Secretary",
      "IAS", "IPS", "IRS", "IFS", "Doctor", "Scientist", "Professor", "Advocate", "Judge",
      "Mayor", "Councillor", "Journalist", "Editor", "Press", "Bureaucrat", "Officer"
    ];
    
    const notableSigners = await Petition.aggregate([
      { $match: { _id: petition._id } },
      { $unwind: "$signatures" },
      {
        $lookup: {
          from: "users",
          localField: "signatures.user",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      { $unwind: "$userDetails" },
      {
        $match: {
          "userDetails.designation": { $regex: notableKeywords.join("|"), $options: "i" }
        }
      },
      { $limit: 10 },
      {
        $project: {
          _id: "$userDetails._id",
          name: "$userDetails.name",
          designation: "$userDetails.designation",
          profilePicture: "$userDetails.profilePicture",
          uniqueCode: "$userDetails.uniqueCode"
        }
      }
    ]);

    // Find matching requested signers status
    let requestedSignersStatus = [];
    if (petition.requestedSigners && petition.requestedSigners.length > 0) {
      const fullPetition = await Petition.findById(petition._id).select('signatures.user');
      const signerUserIds = fullPetition?.signatures?.map(s => s.user) || [];

      if (signerUserIds.length > 0) {
        const emailList = petition.requestedSigners
          .map(rs => rs.email?.trim().toLowerCase())
          .filter(Boolean);
        const nameList = petition.requestedSigners
          .map(rs => rs.name?.trim().toLowerCase())
          .filter(Boolean);

        const matchQuery = {
          _id: { $in: signerUserIds },
          $or: []
        };

        if (emailList.length > 0) {
          matchQuery.$or.push({ email: { $in: emailList } });
        }
        if (nameList.length > 0) {
          const nameRegexes = nameList.map(name => new RegExp(`^${name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i'));
          matchQuery.$or.push({
            "aadhaarKyc.status": "verified",
            "aadhaarKyc.name": { $in: nameRegexes }
          });
        }

        let matchingUsers = [];
        if (matchQuery.$or.length > 0) {
          matchingUsers = await User.find(matchQuery).select("name email profilePicture designation uniqueCode aadhaarKyc").lean();
        }

        requestedSignersStatus = petition.requestedSigners.map(rs => {
          const rsNameLower = rs.name ? rs.name.trim().toLowerCase() : "";
          const rsEmailLower = rs.email ? rs.email.trim().toLowerCase() : "";

          const matchedUser = matchingUsers.find(u => {
            if (rsEmailLower && u.email && u.email.toLowerCase() === rsEmailLower) {
              return true;
            }
            if (u.aadhaarKyc?.status === "verified" && u.aadhaarKyc.name && rsNameLower) {
              return u.aadhaarKyc.name.trim().toLowerCase() === rsNameLower;
            }
            return false;
          });

          const isSigned = rs.isVerifiedSigned || !!matchedUser;

          return {
            _id: rs._id,
            name: rs.name,
            email: rs.email,
            designation: rs.designation,
            hasSigned: isSigned,
            isVerifiedSigned: !!rs.isVerifiedSigned,
            signedBy: matchedUser ? {
              _id: matchedUser._id,
              name: matchedUser.name,
              designation: matchedUser.designation,
              profilePicture: matchedUser.profilePicture,
              uniqueCode: matchedUser.uniqueCode,
            } : (rs.isVerifiedSigned ? {
              name: rs.name,
              designation: rs.designation,
            } : null)
          };
        });
      } else {
        requestedSignersStatus = petition.requestedSigners.map(rs => ({
          _id: rs._id,
          name: rs.name,
          email: rs.email,
          designation: rs.designation,
          hasSigned: !!rs.isVerifiedSigned,
          isVerifiedSigned: !!rs.isVerifiedSigned,
          signedBy: rs.isVerifiedSigned ? {
            name: rs.name,
            designation: rs.designation,
          } : null
        }));
      }
    }

    // Fetch active sub-petitions for this petition if it acts as a Mother Petition
    const subPetitions = await Petition.find({
      motherPetition: petition._id,
      approved: true,
      hidden: { $ne: true }
    })
      .select("title slug petitionDetails.image numberOfSignatures petitionStarter createdAt")
      .sort({ numberOfSignatures: -1 })
      .lean();

    // Calculate combined signatures across mother and linked sub-petitions
    let combinedSignatures = petition.numberOfSignatures || 0;

    if (petition.motherPetition) {
      const motherId = petition.motherPetition._id || petition.motherPetition;
      const [motherDoc, siblingChildPetitions] = await Promise.all([
        Petition.findById(motherId).select("numberOfSignatures").lean(),
        Petition.find({
          motherPetition: motherId,
          approved: true,
          hidden: { $ne: true }
        }).select("numberOfSignatures").lean()
      ]);

      const motherSigs = motherDoc?.numberOfSignatures || 0;
      const childSigsSum = siblingChildPetitions.reduce((sum, p) => sum + (p.numberOfSignatures || 0), 0);
      combinedSignatures = motherSigs + childSigsSum;
    } else if (subPetitions && subPetitions.length > 0) {
      const childSigsSum = subPetitions.reduce((sum, p) => sum + (p.numberOfSignatures || 0), 0);
      combinedSignatures = (petition.numberOfSignatures || 0) + childSigsSum;
    }

    // Convert Mongoose document to plain object to add custom fields
    const petitionObj = petition.toObject();
    petitionObj.notableSigners = notableSigners;
    petitionObj.requestedSignersStatus = requestedSignersStatus;
    petitionObj.subPetitions = subPetitions;
    petitionObj.combinedSignatures = combinedSignatures;

    // Sanitize sensitive creator address & KYC info for non-creators/non-admins
    const creatorId =
      petition.petitionStarter?.user?._id?.toString() ||
      petition.petitionStarter?.user?.toString() ||
      petition.user?._id?.toString() ||
      petition.user?.toString() ||
      "";
    const isCreatorOrAdmin =
      req.user &&
      (creatorId === req.user._id.toString() ||
        req.user.role === "admin" ||
        req.user.role === "superadmin");

    if (!isCreatorOrAdmin && petitionObj.petitionStarter) {
      delete petitionObj.petitionStarter.location;
      delete petitionObj.petitionStarter.mobile;
      delete petitionObj.petitionStarter.aadharNumber;
      delete petitionObj.petitionStarter.panNumber;
      delete petitionObj.petitionStarter.voterNumber;
      delete petitionObj.petitionStarter.pincode;
      delete petitionObj.petitionStarter.mpConstituencyNumber;
      delete petitionObj.petitionStarter.mlaConstituencyNumber;
    }

    res.status(200).json(petitionObj);
  } else {
    res.status(404);
    throw new Error("Petition not found");
  }
});

// @desc    Update petition
// @route   PUT /api/petitions/:id
// @access  Private (Only petition creator)
const updatePetition = asyncHandler(async (req, res) => {
  const petition = await Petition.findById(req.params.id);

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if the user is the petition creator
  if (petition.petitionStarter.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized to update this petition");
  }

  const {
    title,
    decisionMakers,
    requestedSigners,
    country,
    categories,
    petitionDetails,
    petitionStarter,
    constituencySettings,
    signingRequirements,
    socialLinks,
    existingImages,
  } = req.body;

  // Helper for parsing JSON strings if sent via FormData
  const parseField = (val) => {
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch (e) {
        return val;
      }
    }
    return val;
  };

  const parsedDecisionMakers = parseField(decisionMakers);
  const parsedRequestedSigners = parseField(requestedSigners);
  const parsedCategories = parseField(categories);
  const parsedPetitionDetails = parseField(petitionDetails);
  const parsedPetitionStarter = parseField(petitionStarter);
  const parsedConstituencySettings = parseField(constituencySettings);
  const parsedSigningRequirements = parseField(signingRequirements);
  const parsedSocialLinks = parseField(socialLinks);
  const parsedExistingImages = parseField(existingImages);

  // Process image uploads if any new files uploaded
  let newUploadedImages = [];
  if (req.files && req.files.length > 0) {
    newUploadedImages = req.files.map((file) => file.path);
  }

  // Build updated images array
  let finalImages = [];
  if (Array.isArray(parsedExistingImages)) {
    finalImages = [...parsedExistingImages];
  } else if (parsedPetitionDetails?.images && Array.isArray(parsedPetitionDetails.images)) {
    finalImages = [...parsedPetitionDetails.images];
  } else if (petition.petitionDetails?.images && Array.isArray(petition.petitionDetails.images)) {
    finalImages = [...petition.petitionDetails.images];
  }

  if (newUploadedImages.length > 0) {
    finalImages = [...finalImages, ...newUploadedImages];
  }
  finalImages = finalImages.slice(0, 4);

  // Prepare new details objects
  const newPetitionDetails = (parsedPetitionDetails !== undefined || finalImages.length > 0)
    ? {
        ...petition.petitionDetails,
        ...(parsedPetitionDetails || {}),
        images: finalImages,
        image: finalImages[0] || petition.petitionDetails?.image || "",
      }
    : petition.petitionDetails;

  const newSocialLinks = parsedSocialLinks !== undefined
    ? {
        ...(petition.socialLinks || {}),
        ...parsedSocialLinks,
      }
    : petition.socialLinks;

  const newPetitionStarter = parsedPetitionStarter !== undefined
    ? {
        ...petition.petitionStarter,
        ...parsedPetitionStarter,
        user: petition.petitionStarter.user, // Preserve creator ID
      }
    : petition.petitionStarter;

  const newConstituencySettings = parsedConstituencySettings !== undefined
    ? {
        required: parsedConstituencySettings.required || false,
        allowedConstituency:
          parsedConstituencySettings.allowedConstituency || undefined,
      }
    : petition.constituencySettings;

  const newSigningRequirements = parsedSigningRequirements !== undefined
    ? {
        constituency: {
          required: parsedSigningRequirements.constituency?.required || false,
          allowedConstituency:
            parsedSigningRequirements.constituency?.allowedConstituency || undefined,
        },
        aadhar: {
          required: parsedSigningRequirements.aadhar?.required || false,
        },
      }
    : petition.signingRequirements;

  // CASE 1: Petition is ALREADY APPROVED and LIVE
  // Keep the current version live and visible on the website!
  // Store the proposed changes in pendingUpdates for admin review.
  if (petition.approved) {
    petition.hasPendingUpdates = true;
    petition.pendingUpdates = {
      title: title !== undefined ? title : petition.title,
      decisionMakers: parsedDecisionMakers !== undefined ? parsedDecisionMakers : petition.decisionMakers,
      requestedSigners: parsedRequestedSigners !== undefined ? parsedRequestedSigners : petition.requestedSigners,
      country: country !== undefined ? country : petition.country,
      categories: parsedCategories !== undefined ? parsedCategories : petition.categories,
      petitionDetails: newPetitionDetails,
      socialLinks: newSocialLinks,
      petitionStarter: newPetitionStarter,
      constituencySettings: newConstituencySettings,
      signingRequirements: newSigningRequirements,
      submittedAt: new Date(),
    };

    const updatedPetition = await petition.save();

    // Trigger Admin Notification for pending updates
    createAdminNotification({
      category: "petition_approval",
      title: "Petition Updates Submitted",
      message: `Updates submitted for "${petition.title}" by petitioner awaiting review`,
      link: "/dashboard/petition-approval",
      relatedId: petition._id,
      meta: {
        petitionTitle: petition.title,
        petitionerName: petition.petitionStarter?.name,
      },
    });

    return res.status(200).json({
      _id: updatedPetition._id,
      title: updatedPetition.title,
      categories: updatedPetition.categories,
      decisionMakers: updatedPetition.decisionMakers,
      requestedSigners: updatedPetition.requestedSigners,
      country: updatedPetition.country,
      petitionDetails: updatedPetition.petitionDetails,
      petitionStarter: updatedPetition.petitionStarter,
      socialLinks: updatedPetition.socialLinks,
      numberOfSignatures: updatedPetition.numberOfSignatures,
      approved: updatedPetition.approved,
      status: updatedPetition.status,
      hasPendingUpdates: true,
      pendingUpdates: updatedPetition.pendingUpdates,
      message: "Petition updates submitted for admin approval. The current live petition remains active.",
      createdAt: updatedPetition.createdAt,
      updatedAt: updatedPetition.updatedAt,
    });
  }

  // CASE 2: Brand new petition (pending approval or rejected)
  if (title !== undefined) petition.title = title;
  if (parsedDecisionMakers !== undefined) petition.decisionMakers = parsedDecisionMakers;
  if (parsedRequestedSigners !== undefined) petition.requestedSigners = parsedRequestedSigners;
  if (country !== undefined) petition.country = country;
  if (parsedCategories !== undefined) petition.categories = parsedCategories;
  petition.petitionDetails = newPetitionDetails;
  petition.socialLinks = newSocialLinks;
  petition.petitionStarter = newPetitionStarter;
  petition.constituencySettings = newConstituencySettings;
  petition.signingRequirements = newSigningRequirements;

  petition.approved = false;
  petition.status = "pending"; // Reset status to pending for initial approval

  const updatedPetition = await petition.save();

  // Trigger static regeneration on-demand
  triggerRevalidation("/currentpetitions");
  triggerRevalidation(`/currentpetitions/${updatedPetition.slug}`);

  res.status(200).json({
    _id: updatedPetition._id,
    title: updatedPetition.title,
    categories: updatedPetition.categories,
    decisionMakers: updatedPetition.decisionMakers,
    requestedSigners: updatedPetition.requestedSigners,
    country: updatedPetition.country,
    petitionDetails: updatedPetition.petitionDetails,
    petitionStarter: updatedPetition.petitionStarter,
    socialLinks: updatedPetition.socialLinks,
    numberOfSignatures: updatedPetition.numberOfSignatures,
    approved: updatedPetition.approved,
    status: updatedPetition.status,
    hasPendingUpdates: false,
    createdAt: updatedPetition.createdAt,
    updatedAt: updatedPetition.updatedAt,
  });
});

// @desc    Delete petition
// @route   DELETE /api/petitions/:id
// @access  Private (Only petition creator or admin)
const deletePetition = asyncHandler(async (req, res) => {
  const petition = await Petition.findById(req.params.id);

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if the user is the petition creator OR if it's an admin request
  const isAdmin = req.admin; // Admin requests have req.admin set by adminAuth middleware
  const isCreator =
    req.user &&
    petition.petitionStarter.user.toString() === req.user._id.toString();

  if (!isAdmin && !isCreator) {
    res.status(403);
    throw new Error("Not authorized to delete this petition");
  }

  await Petition.findByIdAndDelete(req.params.id);

  res.status(200).json({ message: "Petition removed successfully" });
});

// @desc    Get user's petitions
// @route   GET /api/petitions/my-petitions
// @access  Private
const getUserPetitions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [petitions, totalPetitions] = await Promise.all([
    Petition.find({
      "petitionStarter.user": req.user._id,
    })
      .select("-signatures")
      .populate("petitionStarter.user", "name email profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Petition.countDocuments({
      "petitionStarter.user": req.user._id,
    }),
  ]);

  res.status(200).json({
    petitions,
    currentPage: page,
    totalPages: Math.ceil(totalPetitions / limit),
    totalPetitions,
    hasNextPage: page < Math.ceil(totalPetitions / limit),
    hasPrevPage: page > 1,
  });
});

// @desc    Increment petition signature count
// @route   PUT /api/petitions/:id/sign
// @access  Private
const signPetition = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    res.status(401);
    throw new Error("Not authorized, please login");
  }

  const petition = await Petition.findById(req.params.id);

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if the user is trying to sign their own petition
  if (
    petition.petitionStarter.user &&
    petition.petitionStarter.user.toString() === req.user._id.toString()
  ) {
    res.status(400);
    throw new Error("You cannot sign your own petition");
  }

  // Check if user has already signed this petition
  const hasAlreadySigned = petition.signatures.some(
    (signature) => signature.user.toString() === req.user._id.toString(),
  );

  if (hasAlreadySigned) {
    res.status(400);
    throw new Error("You have already signed this petition");
  }

  // Validate signing requirements
  const constituencyNumber = req.body?.constituencyNumber?.trim();
  const aadharNumber = req.body?.aadharNumber?.trim();

  // Check constituency requirement (backward compatibility)
  if (petition.constituencySettings?.required) {
    if (!constituencyNumber) {
      res.status(400);
      throw new Error("Constituency number is required to sign this petition");
    }

    // Check if specific constituency is required
    if (petition.constituencySettings.allowedConstituency) {
      if (
        constituencyNumber !== petition.constituencySettings.allowedConstituency
      ) {
        res.status(400);
        throw new Error(
          `This petition is restricted to constituency: ${petition.constituencySettings.allowedConstituency}`,
        );
      }
    }
  }

  // Check new signing requirements
  if (petition.signingRequirements?.constituency?.required) {
    if (!constituencyNumber) {
      res.status(400);
      throw new Error("Constituency number is required to sign this petition");
    }

    // Check if specific constituency is required
    if (petition.signingRequirements.constituency.allowedConstituency) {
      if (
        constituencyNumber !==
        petition.signingRequirements.constituency.allowedConstituency
      ) {
        res.status(400);
        throw new Error(
          `This petition is restricted to constituency: ${petition.signingRequirements.constituency.allowedConstituency}`,
        );
      }
    }
  }

  // Check aadhar requirement
  if (petition.signingRequirements?.aadhar?.required) {
    const isUserVerified = req.user?.aadhaarKyc?.status === "verified";
    
    if (!isUserVerified) {
      if (!aadharNumber) {
        res.status(400);
        throw new Error("Aadhar number is required to sign this petition");
      }

      const normalizedAadhar = normalizeAadhaarNumber(aadharNumber);
      if (!isValidAadhaarNumber(normalizedAadhar)) {
        res.status(400);
        throw new Error("Please provide a valid 12-digit Aadhar number");
      }

      const verificationToken = (
        req.body.aadhaarVerificationToken ||
        req.body.aadharVerificationToken ||
        ""
      ).trim();

      if (!verificationToken) {
        res.status(400);
        throw new Error(
          "Aadhaar OTP verification is required before signing this petition",
        );
      }

      let decodedToken;
      try {
        decodedToken = verifyAadhaarVerificationToken(verificationToken);
      } catch (error) {
        res.status(401);
        throw new Error(
          "Invalid or expired Aadhaar verification. Please verify again.",
        );
      }

      if (decodedToken.userId !== req.user._id.toString()) {
        res.status(403);
        throw new Error("Aadhaar verification token does not belong to this user");
      }

      if (decodedToken.aadhaarHash !== hashAadhaarNumber(normalizedAadhar)) {
        res.status(400);
        throw new Error(
          "Verified Aadhaar does not match the Aadhaar number entered",
        );
      }
    } else {
      // For verified users, if they didn't provide a full Aadhar, use the masked one from profile
      const normalizedAadhar = normalizeAadhaarNumber(aadharNumber);
      if (!isValidAadhaarNumber(normalizedAadhar)) {
        // Use masked aadhaar for the signature record
        req.body.aadharNumber = req.user.aadhaarKyc.maskedAadhaar;
      }
    }
  }

  // If Aadhaar verification is required for signature, charge the petition creator 8 points
  if (petition.signingRequirements?.aadhar?.required) {
    const petitionerId = petition.petitionStarter.user;
    if (!petitionerId) {
      res.status(400);
      throw new Error("Petition creator user ID is missing.");
    }

    const petitionerWallet = await Wallet.getOrCreateWallet(petitionerId);
    if (petitionerWallet.balance < 8) {
      res.status(400);
      throw new Error(
        "This petition is temporarily unable to accept Aadhaar-verified signatures due to the creator's insufficient wallet balance."
      );
    }

    petitionerWallet.balance -= 8;
    petitionerWallet.transactions.push({
      type: "debit",
      amount: 8,
      description: `Aadhaar signature charge for petition: ${petition.title}`,
    });
    await petitionerWallet.save();
  }

  // Accept optional referral code from body or query
  let referralDetails = undefined;
  try {
    const referralCode =
      (req.body && req.body.referralCode) || req.query.referralCode;
    if (referralCode && typeof referralCode === "string") {
      const codeOwner = await User.findOne({
        uniqueCode: referralCode.trim().toUpperCase(),
      });
      if (codeOwner) {
        // Prevent self-referral: signing user can't take credit for themselves unless desired
        if (codeOwner._id.toString() !== req.user._id.toString()) {
          referralDetails = {
            code: referralCode.trim().toUpperCase(),
            owner: codeOwner._id,
          };
        } else {
          // Still record the code but without owner to indicate self-used code, if needed
          referralDetails = {
            code: referralCode.trim().toUpperCase(),
          };
        }
      } else {
        // Unknown code: still store the raw code for analysis if desired
        referralDetails = { code: referralCode.trim().toUpperCase() };
      }
    }
  } catch (e) {
    // Non-fatal: continue without referral
    console.warn("Referral code processing error:", e?.message || e);
  }

  // Add user signature and increment the signature count
  petition.signatures.push({
    user: req.user._id,
    referral: referralDetails,
    constituencyNumber: constituencyNumber || undefined,
    aadharNumber: aadharNumber || undefined,
    signedAt: new Date(),
  });
  petition.numberOfSignatures += 1;
  if (petition.targetSignatures > 0) {
    petition.progressPercentage = Math.min(
      Math.floor((petition.numberOfSignatures / petition.targetSignatures) * 100),
      100
    );
  }
  await petition.save();

  // Trigger static regeneration on-demand to refresh signature stats
  triggerRevalidation(`/currentpetitions/${petition.slug}`);

  res.status(200).json({
    message: "Petition signed successfully",
    numberOfSignatures: petition.numberOfSignatures,
    targetSignatures: petition.targetSignatures,
    progressPercentage: petition.progressPercentage,
  });
});

// @desc    Check if user has signed a petition
// @route   GET /api/petitions/:id/check-signature
// @access  Private
const checkUserSignature = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    res.status(401);
    throw new Error("Not authorized, please login");
  }

  const petition = await Petition.findById(req.params.id);

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if user has already signed this petition
  const hasAlreadySigned = petition.signatures.some(
    (signature) => signature.user.toString() === req.user._id.toString(),
  );

  // Check if user is the creator of the petition
  const isCreator =
    petition.petitionStarter.user &&
    petition.petitionStarter.user.toString() === req.user._id.toString();

  res.status(200).json({
    hasSigned: hasAlreadySigned,
    isCreator: isCreator,
    canSign: !hasAlreadySigned && !isCreator,
  });
});

// @desc    Get petitions by country
// @route   GET /api/petitions/country/:country
// @access  Public
const getPetitionsByCountry = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [petitions, totalPetitions] = await Promise.all([
    Petition.find({
      country: req.params.country,
      approved: true,
    })
      .select("-signatures")
      .populate("petitionStarter.user", "name email profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Petition.countDocuments({
      country: req.params.country,
      approved: true,
    }),
  ]);

  res.status(200).json({
    petitions,
    country: req.params.country,
    currentPage: page,
    totalPages: Math.ceil(totalPetitions / limit),
    totalPetitions,
    hasNextPage: page < Math.ceil(totalPetitions / limit),
    hasPrevPage: page > 1,
  });
});

// @desc    Get popular petitions (by signature count)
// @route   GET /api/petitions/popular
// @access  Public
const getPopularPetitions = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  const petitions = await Petition.find({ approved: true })
    .select("-signatures")
    .populate("petitionStarter.user", "name email profilePicture")
    .sort({ numberOfSignatures: -1 })
    .limit(limit)
    .lean();

  res.status(200).json({
    petitions,
    totalCount: petitions.length,
  });
});

// @desc    Get petition statistics
// @route   GET /api/petitions/stats
// @access  Public
const getPetitionStats = asyncHandler(async (req, res) => {
  try {
    // Get total active petitions count
    const totalPetitions = await Petition.countDocuments();

    // Get total successful petitions count
    const totalSuccessfulPetitions = await SuccessfulPetition.countDocuments();

    // Get total signatures count from active petitions
    const activeSignatureStats = await Petition.aggregate([
      {
        $group: {
          _id: null,
          totalSignatures: { $sum: "$numberOfSignatures" },
        },
      },
    ]);

    // Get total signatures count from successful petitions
    const successfulSignatureStats = await SuccessfulPetition.aggregate([
      {
        $group: {
          _id: null,
          totalSignatures: { $sum: "$totalSignatures" },
        },
      },
    ]);

    const activeSignatures =
      activeSignatureStats.length > 0 ?
        activeSignatureStats[0].totalSignatures
      : 0;
    const successfulSignatures =
      successfulSignatureStats.length > 0 ?
        successfulSignatureStats[0].totalSignatures
      : 0;
    const totalSignatures = activeSignatures + successfulSignatures;

    // Get total users count
    const totalUsers = await User.countDocuments();

    // Calculate victories (both from successful petitions and high-signature active petitions)
    const highSignaturePetitions = await Petition.countDocuments({
      numberOfSignatures: { $gte: 1000 },
    });

    const victories = totalSuccessfulPetitions + highSignaturePetitions;

    // Get recent activity count (petitions created in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivePetitions = await Petition.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    const recentSuccessfulPetitions = await SuccessfulPetition.countDocuments({
      successDate: { $gte: thirtyDaysAgo },
    });

    const recentActivity = recentActivePetitions + recentSuccessfulPetitions;

    console.log("Stats calculated:", {
      totalPetitions,
      totalSuccessfulPetitions,
      totalSignatures,
      totalUsers,
      victories,
      recentActivity,
    });

    res.status(200).json({
      totalPetitions: totalPetitions + totalSuccessfulPetitions, // Combined count
      totalSignatures,
      totalUsers,
      victories,
      recentActivity,
      breakdown: {
        activePetitions: totalPetitions,
        successfulPetitions: totalSuccessfulPetitions,
        activeSignatures,
        successfulSignatures,
      },
      message: "Petition statistics retrieved successfully",
    });
  } catch (error) {
    console.error("Error retrieving statistics:", error);
    res.status(500);
    throw new Error("Failed to retrieve statistics: " + error.message);
  }
});

// @desc    Get petitions signed by user
// @route   GET /api/petitions/signed
// @access  Private
const getSignedPetitions = asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user || !req.user._id) {
    res.status(401);
    throw new Error("Not authorized, please login");
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Find petitions where the user has signed (but NOT petitions they created)
  const query = {
    "signatures.user": req.user._id,
    "petitionStarter.user": { $ne: req.user._id }, // Exclude user's own petitions
  };

  const [petitions, totalPetitions] = await Promise.all([
    Petition.find(query)
      .select("-signatures")
      .populate("petitionStarter.user", "name email profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Petition.countDocuments(query),
  ]);

  res.status(200).json({
    petitions,
    currentPage: page,
    totalPages: Math.ceil(totalPetitions / limit),
    totalPetitions,
    hasNextPage: page < Math.ceil(totalPetitions / limit),
    hasPrevPage: page > 1,
  });
});

// @desc    Get all signers for a petition
// @route   GET /api/petitions/:id/signers
// @access  Private (Creator or Admin only)
const getPetitionSigners = asyncHandler(async (req, res) => {
  const petition = await Petition.findById(req.params.id)
    .populate("signatures.user", "name email profilePicture designation uniqueCode")
    .populate("signatures.referral.owner", "name email uniqueCode");

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if user is the creator or an admin
  const isCreator = petition.petitionStarter.user.toString() === req.user._id.toString();
  const isAdmin = req.admin; // Assuming req.admin is set by adminAuth middleware

  if (!isCreator && !isAdmin) {
    res.status(403);
    throw new Error("Not authorized to view signers for this petition");
  }

  res.status(200).json(petition.signatures);
});

// @desc    Get all signers for ALL petitions created by the user
// @route   GET /api/petitions/my-petitions/signers
// @access  Private
const getUserPetitionsSigners = asyncHandler(async (req, res) => {
  const petitions = await Petition.find({ "petitionStarter.user": req.user._id })
    .populate("signatures.user", "name email profilePicture designation uniqueCode")
    .populate("signatures.referral.owner", "name email uniqueCode")
    .select("title signatures");

  if (!petitions) {
    res.status(404);
    throw new Error("No petitions found for this user");
  }

  // Flatten signatures and add petition title to each
  let allSigners = [];
  petitions.forEach(petition => {
    const signersWithTitle = petition.signatures.map(sig => ({
      ...sig.toObject(),
      petitionTitle: petition.title,
      petitionId: petition._id
    }));
    allSigners = [...allSigners, ...signersWithTitle];
  });

  // Sort by date newest first
  allSigners.sort((a, b) => new Date(b.signedAt) - new Date(a.signedAt));

  res.status(200).json(allSigners);
});

// @desc    Get all signatures for a petition (admin, paginated)
// @route   GET /api/admin/petitions/:id/signatures
// @access  Admin
const getAdminPetitionSignatures = asyncHandler(async (req, res) => {
  const petitionId = req.params.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const petition = await Petition.findById(petitionId).select("signatures numberOfSignatures");

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  const totalSignatures = petition.signatures.length;
  const totalPages = Math.ceil(totalSignatures / limit);

  // Sort signatures newest first, then paginate
  const sortedSignatures = [...petition.signatures].sort(
    (a, b) => new Date(b.signedAt) - new Date(a.signedAt)
  );
  const paginatedSignatureIds = sortedSignatures.slice(skip, skip + limit);

  // Now populate user and referral.owner for the paginated slice
  // We need to get the full petition with populated fields for these specific signatures
  const userIds = paginatedSignatureIds.map((s) => s.user).filter(Boolean);
  const ownerIds = paginatedSignatureIds
    .map((s) => s.referral?.owner)
    .filter(Boolean);

  const [users, owners] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select("name email uniqueCode designation profilePicture")
      .lean(),
    User.find({ _id: { $in: ownerIds } })
      .select("name email uniqueCode")
      .lean(),
  ]);

  const userMap = {};
  for (const u of users) userMap[u._id.toString()] = u;
  const ownerMap = {};
  for (const o of owners) ownerMap[o._id.toString()] = o;

  const signatures = paginatedSignatureIds.map((sig) => {
    const sigObj = sig.toObject ? sig.toObject() : { ...sig };
    if (sigObj.user) {
      sigObj.user = userMap[sigObj.user.toString()] || sigObj.user;
    }
    if (sigObj.referral?.owner) {
      sigObj.referral.owner =
        ownerMap[sigObj.referral.owner.toString()] || sigObj.referral.owner;
    }
    return sigObj;
  });

  res.status(200).json({
    signatures,
    currentPage: page,
    totalPages,
    totalSignatures,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  });
});

// @desc    Record unique view for a petition
// @route   POST /api/petitions/:id/view
// @access  Public (Optionally Authenticated)
const recordPetitionView = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let petition = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    petition = await Petition.findById(id);
  }
  if (!petition) {
    petition = await Petition.findOne({ slug: id });
  }

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1";
  const userAgent = req.headers["user-agent"] || "";
  const userId = req.user?._id;

  // Use user ID if authenticated, otherwise IP address
  const viewerKey = userId ? `user_${userId}` : `ip_${ip}`;

  try {
    // Attempt to record new unique view
    await PetitionView.create({
      petition: petition._id,
      viewerKey,
      user: userId || undefined,
      ip,
      userAgent: userAgent.substring(0, 255),
    });

    // Atomically increment views counter on petition
    const updatedPetition = await Petition.findByIdAndUpdate(
      petition._id,
      { $inc: { views: 1 } },
      { new: true }
    );

    res.status(200).json({
      views: updatedPetition.views,
      isNewView: true,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate view by same viewer: return current views without incrementing
      return res.status(200).json({
        views: petition.views,
        isNewView: false,
      });
    }
    throw err;
  }
});

// @desc    Get detailed view insights & follower analytics for petition creator
// @route   GET /api/petitions/:id/insights
// @access  Private (Creator or Admin)
const getPetitionInsights = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let petition = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    petition = await Petition.findById(id);
  }
  if (!petition) {
    petition = await Petition.findOne({ slug: id });
  }

  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  const creatorId =
    petition.petitionStarter?.user?._id?.toString() ||
    petition.petitionStarter?.user?.toString() ||
    petition.user?._id?.toString() ||
    petition.user?.toString() ||
    "";

  const isCreator = req.user && creatorId && creatorId === req.user._id.toString();
  const isAdmin = req.user && (req.user.role === "admin" || req.user.role === "superadmin");

  if (!isCreator && !isAdmin) {
    res.status(403);
    throw new Error("Only the petition creator or admin can view petition insights.");
  }

  // Get Creator with followers
  let creator = null;
  if (creatorId && mongoose.Types.ObjectId.isValid(creatorId)) {
    creator = await User.findById(creatorId).select("followers name");
  }
  const creatorFollowerIds = (creator?.followers || []).map((f) => f.toString());
  const totalFollowersCount = creatorFollowerIds.length;

  // Get all recorded views for this petition
  const recordedViews = await PetitionView.find({ petition: petition._id }).sort({ createdAt: 1 });

  let followerViews = 0;
  let nonFollowerViews = 0;
  let authenticatedViews = 0;
  let guestViews = 0;

  // Daily views breakdown (last 7 days)
  const now = new Date();
  const last7DaysMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    last7DaysMap[dateStr] = { date: dateStr, followers: 0, nonFollowers: 0, total: 0 };
  }

  recordedViews.forEach((v) => {
    let isFollower = false;
    if (v.user) {
      authenticatedViews++;
      if (creatorFollowerIds.includes(v.user.toString())) {
        followerViews++;
        isFollower = true;
      } else {
        nonFollowerViews++;
      }
    } else {
      guestViews++;
      nonFollowerViews++;
    }

    if (v.createdAt) {
      const vDateStr = new Date(v.createdAt).toISOString().split("T")[0];
      if (last7DaysMap[vDateStr]) {
        last7DaysMap[vDateStr].total += 1;
        if (isFollower) {
          last7DaysMap[vDateStr].followers += 1;
        } else {
          last7DaysMap[vDateStr].nonFollowers += 1;
        }
      }
    }
  });

  // Base total views on the highest of petition.views and recordedViews.length
  const totalRecorded = recordedViews.length;
  const totalViews = Math.max(petition.views || 0, totalRecorded);

  // If there are legacy views not in PetitionView, distribute proportionally
  if (totalViews > totalRecorded && totalRecorded > 0) {
    const scale = totalViews / totalRecorded;
    followerViews = Math.round(followerViews * scale);
    nonFollowerViews = totalViews - followerViews;
  } else if (totalRecorded === 0 && totalViews > 0) {
    nonFollowerViews = totalViews;
  }

  const followerPercent = totalViews > 0 ? Number(((followerViews / totalViews) * 100).toFixed(1)) : 0;
  const nonFollowerPercent = totalViews > 0 ? Number(((nonFollowerViews / totalViews) * 100).toFixed(1)) : 0;

  const signaturesCount = petition.numberOfSignatures || 0;
  const conversionRate = totalViews > 0 ? Number(((signaturesCount / totalViews) * 100).toFixed(1)) : 0;

  res.status(200).json({
    totalViews,
    followerViews,
    nonFollowerViews,
    followerPercent,
    nonFollowerPercent,
    authenticatedViews,
    guestViews,
    totalFollowers: totalFollowersCount,
    signaturesCount,
    conversionRate,
    last7DaysTrend: Object.values(last7DaysMap),
  });
});

export {
  createPetition,
  getPetitions,
  getAllPetitionsForAdmin,
  getPetitionById,
  updatePetition,
  deletePetition,
  getUserPetitions,
  signPetition,
  checkUserSignature,
  getPetitionsByCountry,
  getPopularPetitions,
  getPetitionStats,
  getSignedPetitions,
  getPetitionSigners,
  getUserPetitionsSigners,
  getAdminPetitionSignatures,
  recordPetitionView,
  getPetitionInsights,
};
