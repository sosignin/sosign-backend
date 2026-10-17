import asyncHandler from "express-async-handler";
import DataBreach from "../models/dataBreachModel.js";
import User from "../models/userModel.js";
import {
  BREACH_RESPONSE_SOP,
  generateDpbiStatutoryNotice,
  executeRapidHarmReduction,
  dispatchCitizenNotifications,
} from "../services/breachService.js";

/**
 * @desc    Get all data breaches with filters & pagination
 * @route   GET /api/admin/data-breaches
 * @access  Private (Admin)
 */
export const getBreaches = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const query = {};

  if (req.query.status && req.query.status !== "all") {
    query.status = req.query.status;
  }

  if (req.query.severity && req.query.severity !== "all") {
    query.severity = req.query.severity;
  }

  if (req.query.category && req.query.category !== "all") {
    query.category = req.query.category;
  }

  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, "i");
    query.$or = [
      { breachId: searchRegex },
      { title: searchRegex },
      { description: searchRegex },
      { rootCause: searchRegex },
    ];
  }

  const [breaches, total] = await Promise.all([
    DataBreach.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    DataBreach.countDocuments(query),
  ]);

  res.json({
    success: true,
    breaches,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

/**
 * @desc    Report / Create a new personal data breach incident
 * @route   POST /api/admin/data-breaches
 * @access  Private (Admin)
 */
export const createBreach = asyncHandler(async (req, res) => {
  const {
    title,
    severity = "high",
    category = "accidental_disclosure",
    incidentDate = new Date(),
    detectedDate = new Date(),
    affectedCollections = ["User"],
    affectedDataFields = [],
    estimatedAffectedCount = 0,
    affectedUserIds = [],
    description,
    rootCause,
    harmAssessment,
    harmMitigationPlan,
    remedialAdviceForUsers,
  } = req.body;

  if (!title || !description) {
    res.status(400);
    throw new Error("Title and detailed incident description are required");
  }

  const breachId = await DataBreach.generateNextBreachId();
  const createdBy = req.admin?.email || req.admin?.name || "Admin";

  const breach = new DataBreach({
    breachId,
    title,
    severity,
    category,
    incidentDate,
    detectedDate,
    affectedCollections,
    affectedDataFields,
    estimatedAffectedCount,
    affectedUserIds,
    description,
    rootCause: rootCause || "Preliminary investigation ongoing",
    harmAssessment: harmAssessment || {
      confidentialityImpact: "medium",
      integrityImpact: "low",
      availabilityImpact: "low",
      riskToCitizens: "Risk of unauthorized exposure or spam/phishing attempts.",
    },
    harmMitigationPlan:
      harmMitigationPlan ||
      "Execute rapid session invalidation, isolate exploitable endpoints, enforce credential updates, and dispatch citizen advisories.",
    remedialAdviceForUsers:
      remedialAdviceForUsers ||
      "1. Update your password immediately.\n2. Review your recent account activity.\n3. Beware of suspicious emails, SMS, or phone calls claiming to be from SoSign.",
    createdBy,
  });

  // Pre-generate DPBI statutory draft notice under Section 8(6)
  breach.dpbiNotification = {
    status: "drafted",
    statutoryNoticeDraft: generateDpbiStatutoryNotice(breach),
    officerInCharge: "Data Protection & Grievance Redressal Officer (LEO MEO IT Solution Pvt Ltd)",
  };

  await breach.save();

  res.status(201).json({
    success: true,
    message: "Personal data breach incident logged successfully under DPDP Act framework.",
    breach,
  });
});

/**
 * @desc    Get single breach incident details
 * @route   GET /api/admin/data-breaches/:id
 * @access  Private (Admin)
 */
export const getBreachById = asyncHandler(async (req, res) => {
  const breach = await DataBreach.findById(req.params.id)
    .populate("affectedUserIds", "name email mobileNumber uniqueCode createdAt")
    .lean();

  if (!breach) {
    res.status(404);
    throw new Error("Breach incident not found");
  }

  res.json({
    success: true,
    breach,
  });
});

/**
 * @desc    Update data breach incident details
 * @route   PUT /api/admin/data-breaches/:id
 * @access  Private (Admin)
 */
export const updateBreach = asyncHandler(async (req, res) => {
  const breach = await DataBreach.findById(req.params.id);

  if (!breach) {
    res.status(404);
    throw new Error("Breach incident not found");
  }

  const updatableFields = [
    "title",
    "status",
    "severity",
    "category",
    "description",
    "rootCause",
    "affectedCollections",
    "affectedDataFields",
    "estimatedAffectedCount",
    "affectedUserIds",
    "harmAssessment",
    "harmMitigationPlan",
    "remedialAdviceForUsers",
    "postMortemReport",
  ];

  updatableFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      breach[field] = req.body[field];
    }
  });

  if (req.body.status === "resolved" && !breach.resolvedAt) {
    breach.resolvedAt = new Date();
  }

  // Regenerate DPBI statutory draft notice
  breach.dpbiNotification.statutoryNoticeDraft = generateDpbiStatutoryNotice(breach);

  await breach.save();

  res.json({
    success: true,
    message: "Breach incident updated successfully",
    breach,
  });
});

/**
 * @desc    Execute Rapid Harm Reduction (DPDP Point 4)
 * @route   POST /api/admin/data-breaches/:id/contain
 * @access  Private (Admin)
 */
export const containBreachAction = asyncHandler(async (req, res) => {
  const result = await executeRapidHarmReduction(req.params.id, req.admin, req.body);
  res.json({
    success: true,
    message: `Rapid harm reduction successfully executed. Impacted ${result.affectedCount} user sessions/accounts.`,
    ...result,
  });
});

/**
 * @desc    Generate / Refresh statutory notice to Data Protection Board of India
 * @route   POST /api/admin/data-breaches/:id/generate-dpbi-notice
 * @access  Private (Admin)
 */
export const generateDpbiNoticeAction = asyncHandler(async (req, res) => {
  const breach = await DataBreach.findById(req.params.id);
  if (!breach) {
    res.status(404);
    throw new Error("Breach incident not found");
  }

  const statutoryNotice = generateDpbiStatutoryNotice(breach);
  breach.dpbiNotification.statutoryNoticeDraft = statutoryNotice;
  await breach.save();

  res.json({
    success: true,
    statutoryNoticeDraft: statutoryNotice,
  });
});

/**
 * @desc    Record statutory submission to Data Protection Board of India (DPBI)
 * @route   POST /api/admin/data-breaches/:id/record-dpbi-submission
 * @access  Private (Admin)
 */
export const recordDpbiSubmissionAction = asyncHandler(async (req, res) => {
  const { referenceNumber, acknowledgedByBoard = false, notes = "", officerInCharge } = req.body;

  const breach = await DataBreach.findById(req.params.id);
  if (!breach) {
    res.status(404);
    throw new Error("Breach incident not found");
  }

  breach.dpbiNotification = {
    ...breach.dpbiNotification,
    status: "submitted",
    submittedAt: new Date(),
    referenceNumber: referenceNumber || `DPBI-ACK-${Date.now()}`,
    acknowledgedByBoard,
    notes,
    officerInCharge: officerInCharge || breach.dpbiNotification?.officerInCharge,
  };

  if (breach.status === "contained") {
    breach.status = "notified";
  }

  await breach.save();

  res.json({
    success: true,
    message: "Statutory DPBI intimation recorded successfully under Section 8(6).",
    dpbiNotification: breach.dpbiNotification,
  });
});

/**
 * @desc    Notify affected Data Principals via in-app & email (DPDP Point 3)
 * @route   POST /api/admin/data-breaches/:id/notify-users
 * @access  Private (Admin)
 */
export const notifyAffectedUsersAction = asyncHandler(async (req, res) => {
  const result = await dispatchCitizenNotifications(req.params.id, req.admin, req.body);
  res.json({
    success: true,
    message: `Citizen breach notifications dispatched to ${result.totalNotified} Data Principals.`,
    ...result,
  });
});

/**
 * @desc    Get DPDP Breach Response Center Dashboard Statistics
 * @route   GET /api/admin/data-breaches/stats
 * @access  Private (Admin)
 */
export const getBreachStats = asyncHandler(async (req, res) => {
  const [total, detected, contained, notified, resolved, closed, totalAffected] = await Promise.all([
    DataBreach.countDocuments(),
    DataBreach.countDocuments({ status: "detected" }),
    DataBreach.countDocuments({ status: "contained" }),
    DataBreach.countDocuments({ status: "notified" }),
    DataBreach.countDocuments({ status: "resolved" }),
    DataBreach.countDocuments({ status: "closed" }),
    DataBreach.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: "$estimatedAffectedCount" },
        },
      },
    ]),
  ]);

  const dpbiSubmittedCount = await DataBreach.countDocuments({
    "dpbiNotification.status": "submitted",
  });

  res.json({
    success: true,
    stats: {
      total,
      detected,
      contained,
      notified,
      resolved,
      closed,
      dpbiSubmittedCount,
      totalAffectedCitizens: totalAffected[0]?.total || 0,
    },
  });
});

/**
 * @desc    Get DPDP Act 5-Stage Data Breach Response Plan SOP
 * @route   GET /api/admin/data-breaches/sop-plan
 * @access  Private (Admin)
 */
export const getBreachSop = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    sop: BREACH_RESPONSE_SOP,
  });
});

export default {
  getBreaches,
  createBreach,
  getBreachById,
  updateBreach,
  containBreachAction,
  generateDpbiNoticeAction,
  recordDpbiSubmissionAction,
  notifyAffectedUsersAction,
  getBreachStats,
  getBreachSop,
};
