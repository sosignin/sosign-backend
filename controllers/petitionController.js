import asyncHandler from "express-async-handler";
import Petition from "../models/petitionModel.js";
import User from "../models/userModel.js";
import SuccessfulPetition from "../models/successfulPetitionModel.js";
import cloudinary from "../config/cloudinary.js";
import { sendPetitionNotificationEmails } from "../config/emailConfig.js";
import {
  normalizeAadhaarNumber,
  isValidAadhaarNumber,
  hashAadhaarNumber,
  verifyAadhaarVerificationToken,
} from "../utils/aadhaarVerificationUtils.js";

// @desc    Create a new petition
// @route   POST /api/petitions
// @access  Private
const createPetition = asyncHandler(async (req, res) => {
  const {
    title,
    decisionMakers,
    country,
    petitionDetails,
    petitionStarter,
    categories,
    constituencySettings,
    signingRequirements,
    aadhaarVerificationToken,
    aadharVerificationToken,
  } = req.body;

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

  // Enforce Aadhaar OTP verification for petition creator.
  const starterAadhaarRaw =
    parsedPetitionStarter?.aadharNumber || parsedPetitionStarter?.aadhaarNumber;
  const normalizedStarterAadhaar = normalizeAadhaarNumber(starterAadhaarRaw);

  if (!isValidAadhaarNumber(normalizedStarterAadhaar)) {
    res.status(400);
    throw new Error("Please provide a valid 12-digit Aadhar number");
  }

  const verificationToken = (
    aadhaarVerificationToken ||
    aadharVerificationToken ||
    ""
  ).trim();

  if (!verificationToken) {
    res.status(400);
    throw new Error(
      "Aadhaar OTP verification is required before creating a petition",
    );
  }

  let decodedVerificationToken;
  try {
    decodedVerificationToken =
      verifyAadhaarVerificationToken(verificationToken);
  } catch (error) {
    res.status(401);
    throw new Error(
      "Invalid or expired Aadhaar verification. Please verify again.",
    );
  }

  if (decodedVerificationToken.userId !== userId.toString()) {
    res.status(403);
    throw new Error("Aadhaar verification token does not belong to this user");
  }

  if (
    decodedVerificationToken.aadhaarHash !==
    hashAadhaarNumber(normalizedStarterAadhaar)
  ) {
    res.status(400);
    throw new Error(
      "Verified Aadhaar does not match the Aadhaar number entered in the form",
    );
  }

  parsedPetitionStarter = {
    ...parsedPetitionStarter,
    aadharNumber: normalizedStarterAadhaar,
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
    // Categories is an array field with lowercase values (education, human_rights, etc.)
    // Convert the category to lowercase and use $in to match
    const categoryLower = category.toLowerCase().replace(/\s+/g, "_");
    query.categories = { $in: [categoryLower] };
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
  let sortOption = { createdAt: -1 }; // Default: newest first
  if (sort === "signatures") {
    sortOption = { numberOfSignatures: -1 };
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
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

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
  const [petitions, totalPetitions] = await Promise.all([
    Petition.find(query)
      .select("-signatures")
      .populate("petitionStarter.user", "name email designation profilePicture")
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
        "name email designation uniqueCode profilePicture",
      )
      .select({ signatures: { $slice: -20 } })
      .populate("signatures.user", "name email uniqueCode designation profilePicture")
      .populate("signatures.referral.owner", "name email uniqueCode");
  }

  // If not found by ID, try to find by slug
  if (!petition) {
    petition = await Petition.findOne({ slug: idOrSlug })
      .populate(
        "petitionStarter.user",
        "name email designation uniqueCode profilePicture",
      )
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

    // Convert Mongoose document to plain object to add custom field
    const petitionObj = petition.toObject();
    petitionObj.notableSigners = notableSigners;

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
    country,
    petitionDetails,
    constituencySettings,
    signingRequirements,
  } = req.body;

  // Update only the fields that are provided
  if (title !== undefined) petition.title = title;
  if (decisionMakers !== undefined) petition.decisionMakers = decisionMakers;
  if (country !== undefined) petition.country = country;
  if (petitionDetails !== undefined) {
    petition.petitionDetails = {
      ...petition.petitionDetails,
      ...petitionDetails,
    };
  }
  if (constituencySettings !== undefined) {
    petition.constituencySettings = {
      required: constituencySettings.required || false,
      allowedConstituency:
        constituencySettings.allowedConstituency || undefined,
    };
  }
  if (signingRequirements !== undefined) {
    petition.signingRequirements = {
      constituency: {
        required: signingRequirements.constituency?.required || false,
        allowedConstituency:
          signingRequirements.constituency?.allowedConstituency || undefined,
      },
      aadhar: {
        required: signingRequirements.aadhar?.required || false,
      },
    };
  }

  const updatedPetition = await petition.save();

  res.status(200).json({
    _id: updatedPetition._id,
    title: updatedPetition.title,
    decisionMakers: updatedPetition.decisionMakers,
    country: updatedPetition.country,
    petitionDetails: updatedPetition.petitionDetails,
    petitionStarter: updatedPetition.petitionStarter,
    numberOfSignatures: updatedPetition.numberOfSignatures,
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
  await petition.save();

  res.status(200).json({
    message: "Petition signed successfully",
    numberOfSignatures: petition.numberOfSignatures,
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
};
