import asyncHandler from "express-async-handler";
import ConsentLog from "../models/consentLogModel.js";
import User from "../models/userModel.js";
import { getCleanIp } from "../utils/ipHelper.js";

// @desc    Record proof/log of consent (DPDP Act Sec 6(10))
// @route   POST /api/consent/log
// @access  Public / Authenticated
export const recordConsentLog = asyncHandler(async (req, res) => {
  const {
    consentType,
    purpose,
    noticeVersion,
    noticeLanguage,
    granted,
    method,
    metadata,
    userName,
    userEmail,
  } = req.body;

  const ipAddress = getCleanIp(req);
  const userAgent = req.headers["user-agent"] || "";

  let userId = null;
  let finalName = userName || "Anonymous Visitor";
  let finalEmail = userEmail || "";

  // If request has authenticated user
  if (req.user) {
    userId = req.user._id;
    finalName = req.user.name || finalName;
    finalEmail = req.user.email || finalEmail;
  }

  const logEntry = await ConsentLog.create({
    user: userId,
    userName: finalName,
    userEmail: finalEmail,
    ipAddress,
    userAgent,
    consentType: consentType || "terms_and_privacy",
    purpose: purpose || "Processing of digital personal data in accordance with DPDP Act 2023",
    noticeVersion: noticeVersion || "2026.1-DPDP",
    noticeLanguage: noticeLanguage || "en",
    granted: granted !== undefined ? Boolean(granted) : true,
    method: method || "affirmative_checkbox",
    metadata: metadata || {},
  });

  // If user is authenticated, keep synchronized in user's profile consentRecords
  if (userId) {
    const user = await User.findById(userId);
    if (user) {
      if (!user.consentRecords) {
        user.consentRecords = {
          acceptedPrivacyPolicyVersion: noticeVersion || "2026.1-DPDP",
          acceptedAt: new Date(),
          noticeLanguage: noticeLanguage || "en",
          consentMethod: method || "affirmative_checkbox",
          marketingConsent: false,
          analyticsConsent: false,
          consentHistory: [],
        };
      }

      if (consentType === "marketing_communications") {
        user.consentRecords.marketingConsent = Boolean(granted);
      } else if (consentType === "analytics_tracking") {
        user.consentRecords.analyticsConsent = Boolean(granted);
      }

      user.consentRecords.consentHistory.push({
        purpose: consentType,
        granted: Boolean(granted),
        timestamp: new Date(),
        ipAddress,
        userAgent,
        language: noticeLanguage || "en",
      });

      await user.save();
    }
  }

  res.status(201).json({
    success: true,
    message: "Consent proof logged successfully in compliance with DPDP Act Section 6(10).",
    consentId: logEntry._id,
    timestamp: logEntry.createdAt,
  });
});

// @desc    Withdraw consent (DPDP Act Sec 6(4))
// @route   POST /api/consent/withdraw
// @access  Private (User)
export const withdrawConsent = asyncHandler(async (req, res) => {
  const { consentType, reason } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const ipAddress = getCleanIp(req);
  const userAgent = req.headers["user-agent"] || "";

  // Log the withdrawal event as proof
  await ConsentLog.create({
    user: user._id,
    userName: user.name,
    userEmail: user.email,
    ipAddress,
    userAgent,
    consentType: "consent_withdrawal",
    purpose: `Withdrawal of ${consentType || "optional"} consent under Section 6(4) of DPDP Act 2023`,
    noticeVersion: "2026.1-DPDP",
    noticeLanguage: "en",
    granted: false,
    method: "granular_switch",
    metadata: {
      withdrawnType: consentType,
      reason: reason || "User exercised statutory Right to Withdraw Consent",
    },
  });

  if (!user.consentRecords) {
    user.consentRecords = {
      acceptedPrivacyPolicyVersion: "2026.1-DPDP",
      acceptedAt: new Date(),
      marketingConsent: false,
      analyticsConsent: false,
      consentHistory: [],
    };
  }

  if (consentType === "marketing_communications") {
    user.consentRecords.marketingConsent = false;
  } else if (consentType === "analytics_tracking") {
    user.consentRecords.analyticsConsent = false;
  }

  user.consentRecords.consentHistory.push({
    purpose: `withdraw_${consentType}`,
    granted: false,
    timestamp: new Date(),
    ipAddress,
    userAgent,
    language: "en",
  });

  await user.save();

  res.status(200).json({
    success: true,
    message: "Consent withdrawn successfully. Processing has been ceased for this purpose.",
    consentRecords: user.consentRecords,
  });
});

// @desc    Get all consent logs (for Admin legal proof & compliance audit)
// @route   GET /api/consent/admin/logs
// @access  Admin
export const getAdminConsentLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const { search, consentType, granted, language } = req.query;

  const query = {};

  if (consentType && consentType !== "all") {
    query.consentType = consentType;
  }

  if (granted !== undefined && granted !== "all") {
    query.granted = granted === "true";
  }

  if (language && language !== "all") {
    query.noticeLanguage = language;
  }

  if (search && search.trim()) {
    query.$or = [
      { userName: { $regex: search.trim(), $options: "i" } },
      { userEmail: { $regex: search.trim(), $options: "i" } },
      { ipAddress: { $regex: search.trim(), $options: "i" } },
      { purpose: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const total = await ConsentLog.countDocuments(query);
  const logs = await ConsentLog.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Stats for the compliance summary
  const totalLogs = await ConsentLog.countDocuments();
  const registrationCount = await ConsentLog.countDocuments({ consentType: "registration" });
  const signatureCount = await ConsentLog.countDocuments({ consentType: "petition_signature" });
  const cookieCount = await ConsentLog.countDocuments({ consentType: "cookie_banner" });
  const withdrawalCount = await ConsentLog.countDocuments({ consentType: "consent_withdrawal" });

  res.status(200).json({
    success: true,
    logs,
    counts: {
      total: totalLogs,
      registration: registrationCount,
      signature: signatureCount,
      cookie: cookieCount,
      withdrawal: withdrawalCount,
    },
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    },
  });
});

// @desc    Export consent logs as JSON for Data Protection Board audit
// @route   GET /api/consent/admin/export
// @access  Admin
export const exportConsentLogs = asyncHandler(async (req, res) => {
  const logs = await ConsentLog.find()
    .sort({ createdAt: -1 })
    .limit(5000);

  res.status(200).json({
    success: true,
    exportMeta: {
      generatedAt: new Date().toISOString(),
      statutoryPurpose: "Statutory Proof of Consent under Section 6(10) of DPDP Act 2023",
      totalRecords: logs.length,
    },
    logs,
  });
});
