import asyncHandler from "express-async-handler";
import SuccessfulPetition from "../models/successfulPetitionModel.js";
import Petition from "../models/petitionModel.js";

// @desc    Create a new successful petition
// @route   POST /api/successful-petitions
// @access  Private
const createSuccessfulPetition = asyncHandler(async (req, res) => {
  const {
    petitionTitle,
    totalSignatures,
    decisionMakers,
    issue,
    location,
    petitionStarterName,
    startedDate,
    image,
    originalPetitionId,
    outcome,
    category,
  } = req.body;

  // Validate required fields
  if (
    !petitionTitle ||
    totalSignatures === undefined || totalSignatures === null ||
    !decisionMakers ||
    !issue ||
    !location ||
    !petitionStarterName ||
    !startedDate
  ) {
    res.status(400);
    throw new Error("Please provide all required fields");
  }

  // Validate decision makers array
  if (!Array.isArray(decisionMakers) || decisionMakers.length === 0) {
    res.status(400);
    throw new Error("At least one decision maker is required");
  }

  // Validate each decision maker
  for (const dm of decisionMakers) {
    if (!dm.name || !dm.email) {
      res.status(400);
      throw new Error("Decision maker name and email are required");
    }
  }

  // Check if original petition exists (if provided)
  if (originalPetitionId) {
    const originalPetition = await Petition.findById(originalPetitionId);
    if (!originalPetition) {
      res.status(404);
      throw new Error("Original petition not found");
    }
  }

  // Prevent duplicates: find existing by originalPetitionId or exact title
  let successfulPetition = null;
  if (originalPetitionId) {
    successfulPetition = await SuccessfulPetition.findOne({ originalPetitionId });
  }
  if (!successfulPetition && petitionTitle) {
    successfulPetition = await SuccessfulPetition.findOne({ petitionTitle: petitionTitle.trim() });
  }

  if (successfulPetition) {
    successfulPetition.petitionTitle = petitionTitle;
    successfulPetition.totalSignatures = parseInt(totalSignatures);
    successfulPetition.decisionMakers = decisionMakers;
    successfulPetition.issue = issue;
    successfulPetition.location = location;
    successfulPetition.petitionStarterName = petitionStarterName;
    successfulPetition.startedDate = new Date(startedDate);
    if (image) successfulPetition.image = image;
    if (originalPetitionId) successfulPetition.originalPetitionId = originalPetitionId;
    if (outcome) successfulPetition.outcome = outcome;
    if (category) successfulPetition.category = category;
    await successfulPetition.save();

    return res.status(200).json({
      success: true,
      message: "Successful petition updated successfully",
      successfulPetition,
    });
  }

  successfulPetition = await SuccessfulPetition.create({
    petitionTitle,
    totalSignatures: parseInt(totalSignatures),
    decisionMakers,
    issue,
    location,
    petitionStarterName,
    startedDate: new Date(startedDate),
    image,
    originalPetitionId: originalPetitionId || undefined,
    outcome,
    category,
  });

  if (successfulPetition) {
    res.status(201).json({
      success: true,
      message: "Successful petition created successfully",
      successfulPetition,
    });
  } else {
    res.status(400);
    throw new Error("Invalid successful petition data");
  }
});

// @desc    Get all successful petitions
// @route   GET /api/successful-petitions
// @access  Public
const getSuccessfulPetitions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Build filter object
  const filter = {};

  if (req.query.category) {
    filter.category = req.query.category;
  }

  if (req.query.location) {
    filter.location = { $regex: req.query.location, $options: "i" };
  }

  // Add search functionality
  if (req.query.search) {
    filter.$or = [
      { petitionTitle: { $regex: req.query.search, $options: "i" } },
      { issue: { $regex: req.query.search, $options: "i" } },
      { outcome: { $regex: req.query.search, $options: "i" } },
    ];
  }

  // Build sort object
  let sort = { successDate: -1 }; // Default: newest first

  if (req.query.sort === "signatures") {
    sort = { totalSignatures: -1 };
  } else if (req.query.sort === "title") {
    sort = { petitionTitle: 1 };
  } else if (req.query.sort === "oldest") {
    sort = { successDate: 1 };
  }

  const total = await SuccessfulPetition.countDocuments(filter);
  const successfulPetitions = await SuccessfulPetition.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate("originalPetitionId", "title slug");

  res.json({
    success: true,
    successfulPetitions,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalResults: total,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
});

// @desc    Get successful petition by ID
// @route   GET /api/successful-petitions/:id
// @access  Public
const getSuccessfulPetitionById = asyncHandler(async (req, res) => {
  const successfulPetition = await SuccessfulPetition.findById(req.params.id)
    .populate("originalPetitionId", "title slug numberOfSignatures");

  if (successfulPetition) {
    res.json({
      success: true,
      successfulPetition,
    });
  } else {
    res.status(404);
    throw new Error("Successful petition not found");
  }
});

// @desc    Update successful petition
// @route   PUT /api/successful-petitions/:id
// @access  Private
const updateSuccessfulPetition = asyncHandler(async (req, res) => {
  const successfulPetition = await SuccessfulPetition.findById(req.params.id);

  if (!successfulPetition) {
    res.status(404);
    throw new Error("Successful petition not found");
  }

  const {
    petitionTitle,
    totalSignatures,
    decisionMakers,
    issue,
    location,
    petitionStarterName,
    startedDate,
    image,
    outcome,
    category,
  } = req.body;

  // Validate decision makers if provided
  if (decisionMakers) {
    if (!Array.isArray(decisionMakers) || decisionMakers.length === 0) {
      res.status(400);
      throw new Error("At least one decision maker is required");
    }

    for (const dm of decisionMakers) {
      if (!dm.name || !dm.email) {
        res.status(400);
        throw new Error("Decision maker name and email are required");
      }
    }
  }

  // Update fields
  successfulPetition.petitionTitle = petitionTitle || successfulPetition.petitionTitle;
  successfulPetition.totalSignatures = totalSignatures !== undefined
    ? parseInt(totalSignatures)
    : successfulPetition.totalSignatures;
  successfulPetition.decisionMakers = decisionMakers || successfulPetition.decisionMakers;
  successfulPetition.issue = issue || successfulPetition.issue;
  successfulPetition.location = location || successfulPetition.location;
  successfulPetition.petitionStarterName = petitionStarterName || successfulPetition.petitionStarterName;
  successfulPetition.startedDate = startedDate
    ? new Date(startedDate)
    : successfulPetition.startedDate;
  successfulPetition.image = image !== undefined ? image : successfulPetition.image;
  successfulPetition.outcome = outcome !== undefined ? outcome : successfulPetition.outcome;
  successfulPetition.category = category || successfulPetition.category;

  const updatedSuccessfulPetition = await successfulPetition.save();

  res.json({
    success: true,
    message: "Successful petition updated successfully",
    successfulPetition: updatedSuccessfulPetition,
  });
});

// @desc    Delete successful petition
// @route   DELETE /api/successful-petitions/:id
// @access  Private (Admin or authenticated user)
const deleteSuccessfulPetition = asyncHandler(async (req, res) => {
  const successfulPetition = await SuccessfulPetition.findById(req.params.id);

  if (!successfulPetition) {
    res.status(404);
    throw new Error("Successful petition not found");
  }

  // Allow admin deletion or user deletion (if user is authenticated)
  const isAdmin = req.admin; // Admin requests have req.admin set by adminAuth middleware
  const isUser = req.user; // User requests have req.user set by protect middleware

  if (!isAdmin && !isUser) {
    res.status(403);
    throw new Error("Not authorized to delete this successful petition");
  }

  await SuccessfulPetition.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Successful petition deleted successfully",
  });
});

// @desc    Get successful petitions by category
// @route   GET /api/successful-petitions/category/:category
// @access  Public
const getSuccessfulPetitionsByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const total = await SuccessfulPetition.countDocuments({ category });
  const successfulPetitions = await SuccessfulPetition.find({ category })
    .sort({ successDate: -1 })
    .skip(skip)
    .limit(limit)
    .populate("originalPetitionId", "title slug");

  res.json({
    success: true,
    successfulPetitions,
    category,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalResults: total,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
});

// @desc    Get successful petitions statistics
// @route   GET /api/successful-petitions/stats
// @access  Public
const getSuccessfulPetitionsStats = asyncHandler(async (req, res) => {
  const totalSuccessfulPetitions = await SuccessfulPetition.countDocuments();

  const categoryStats = await SuccessfulPetition.aggregate([
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        totalSignatures: { $sum: "$totalSignatures" },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  const locationStats = await SuccessfulPetition.aggregate([
    {
      $group: {
        _id: "$location",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
    {
      $limit: 10,
    },
  ]);

  const totalSignatures = await SuccessfulPetition.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: "$totalSignatures" },
      },
    },
  ]);

  res.json({
    success: true,
    stats: {
      totalSuccessfulPetitions,
      totalSignatures: totalSignatures[0]?.total || 0,
      categoryBreakdown: categoryStats,
      topLocations: locationStats,
    },
  });
});

// @desc    Admin download successful petition as PDF
// @route   GET /api/successful-petitions/admin/download/:id
// @access  Admin
const adminDownloadSuccessfulPetitionPDF = asyncHandler(async (req, res) => {
  const successfulPetition = await SuccessfulPetition.findById(req.params.id)
    .populate("originalPetitionId", "title slug numberOfSignatures");

  if (!successfulPetition) {
    res.status(404);
    throw new Error("Successful petition not found");
  }

  // Import PDFKit dynamically
  const PDFDocument = (await import("pdfkit")).default;

  // Create PDF document
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: `Successful Petition: ${successfulPetition.petitionTitle}`,
      Author: "SOSIGN Platform - Admin Export",
      Subject: "Successful Petition Data Export",
      CreationDate: new Date(),
    },
  });

  // Set response headers for PDF download
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="successful-petition-${successfulPetition._id}-admin-export.pdf"`
  );

  // Pipe PDF to response
  doc.pipe(res);

  // Helper function for adding sections
  const addSectionHeader = (text) => {
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor("#28a745").font("Helvetica-Bold").text(text);
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e0e0e0").stroke();
    doc.moveDown(0.5);
    doc.fillColor("#333333").font("Helvetica");
  };

  const addLabelValue = (label, value) => {
    doc.fontSize(10).font("Helvetica-Bold").text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(value || "N/A");
  };

  // ===== HEADER =====
  doc.rect(0, 0, 612, 100).fill("#28a745");
  doc.fontSize(24).fillColor("#ffffff").font("Helvetica-Bold").text("SOSIGN", 50, 30);
  doc.fontSize(12).fillColor("#ffffff").font("Helvetica").text("Successful Petition Export", 50, 60);
  doc.fontSize(10).text(`Generated on: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`, 50, 78);

  doc.moveDown(3);
  doc.y = 120;

  // ===== PETITION TITLE =====
  doc.fontSize(18).fillColor("#1a1a2e").font("Helvetica-Bold").text(successfulPetition.petitionTitle, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(12).fillColor("#28a745").font("Helvetica-Oblique").text("✓ SUCCESSFUL PETITION", { align: "center" });
  doc.moveDown(1);

  // ===== PETITION DETAILS =====
  addSectionHeader("PETITION DETAILS");
  addLabelValue("Petition ID", successfulPetition._id.toString());
  addLabelValue("Category", successfulPetition.category || "Uncategorized");
  addLabelValue("Location", successfulPetition.location);
  addLabelValue("Total Signatures", successfulPetition.totalSignatures?.toLocaleString());
  addLabelValue("Started Date", new Date(successfulPetition.startedDate).toLocaleDateString());
  addLabelValue("Success Date", new Date(successfulPetition.successDate).toLocaleDateString());

  // ===== PETITION STARTER =====
  addSectionHeader("PETITION STARTER");
  addLabelValue("Name", successfulPetition.petitionStarterName);

  // ===== ISSUE =====
  addSectionHeader("ISSUE");
  doc.fontSize(10).font("Helvetica").text(successfulPetition.issue, { align: "justify" });

  // ===== OUTCOME (if available) =====
  if (successfulPetition.outcome) {
    addSectionHeader("OUTCOME");
    doc.fontSize(10).font("Helvetica").text(successfulPetition.outcome, { align: "justify" });
  }

  // ===== DECISION MAKERS =====
  if (successfulPetition.decisionMakers && successfulPetition.decisionMakers.length > 0) {
    addSectionHeader("DECISION MAKERS");
    successfulPetition.decisionMakers.forEach((dm, index) => {
      doc.fontSize(10).font("Helvetica").text(
        `${index + 1}. ${dm.name}${dm.organization ? ` (${dm.organization})` : ""}${dm.email ? ` - ${dm.email}` : ""}`
      );
    });
  }

  // ===== ORIGINAL PETITION REFERENCE (if linked) =====
  if (successfulPetition.originalPetitionId) {
    addSectionHeader("ORIGINAL PETITION");
    addLabelValue("Title", successfulPetition.originalPetitionId.title);
    addLabelValue("Original Signatures", successfulPetition.originalPetitionId.numberOfSignatures?.toLocaleString());
  }

  // ===== FOOTER =====
  doc.moveDown(2);
  doc.fontSize(8).fillColor("#999999").font("Helvetica").text(
    `This document was exported by Admin (${req.admin?.username || "admin"}) on ${new Date().toISOString()}`,
    { align: "center" }
  );

  // Finalize PDF
  doc.end();
});

export {
  createSuccessfulPetition,
  getSuccessfulPetitions,
  getSuccessfulPetitionById,
  updateSuccessfulPetition,
  deleteSuccessfulPetition,
  getSuccessfulPetitionsByCategory,
  getSuccessfulPetitionsStats,
  adminDownloadSuccessfulPetitionPDF,
};
