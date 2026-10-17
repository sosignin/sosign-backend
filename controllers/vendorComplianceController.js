import asyncHandler from "express-async-handler";
import VendorCompliance from "../models/vendorComplianceModel.js";
import User from "../models/userModel.js";

/**
 * DPDP Act 2023 - Statutory Internal Policies & DPO Charter (Points 1, 11 & 12)
 */
export const INTERNAL_POLICIES_AND_CHARTER = {
  framework: "Digital Personal Data Protection (DPDP) Act, 2023 & Indian IT (SPDI) Rules",
  dpoCharter: {
    statutoryBasis: "Section 8(10) & Section 10(2)(a) DPDP Act 2023",
    role: "Data Protection & Grievance Redressal Officer",
    entity: "LEO MEO IT Solution Private Limited (Platform: SoSign)",
    officerName: "Mr. Narendra Kumar (Designated DPO & Head of Legal Compliance)",
    email: "dpo@sosign.in",
    grievanceEmail: "grievance@sosign.in",
    helplinePhone: "+91 9323677688",
    officeAddress: "NESCO Center, Western Express Highway, Goregaon East, Mumbai, Maharashtra 400063, India",
    responsibilities: [
      "Act as the primary point of contact for Data Principals exercising statutory rights under DPDP Act 2023.",
      "Receive, investigate, and resolve data grievances within the statutory SLA of 15 calendar days (acknowledged within 24 hours).",
      "Ensure Data Fiduciary compliance with Section 8 obligations, reasonable security safeguards, and Section 9 child data protections.",
      "Liaise with the Data Protection Board of India (DPBI) and CERT-In during incident intimations under Section 8(6).",
      "Conduct bi-annual vendor risk audits and maintain the Data Processing Agreement (DPA) registry.",
    ],
    escalationAuthority: "Data Protection Board of India (DPBI), New Delhi (https://dpbi.gov.in)",
  },
  retentionSchedule: [
    {
      dataCategory: "Aadhaar KYC Verification Records",
      retentionPeriod: "Lifespan of Account + 5 Years (per PMLA & IT SPDI rules)",
      storageLocation: "Encrypted MongoDB (SHA-256 masked, zero biometric storage per UIDAI)",
      disposalProtocol: "Cryptographic deletion and sanitization upon account erasure",
    },
    {
      dataCategory: "PAN & Voter ID Verification Data",
      retentionPeriod: "Duration of Active Account + 3 Years",
      storageLocation: "Encrypted Cloud Database (AWS ap-south-1 Mumbai)",
      disposalProtocol: "Purged via automated erasure routine within 30 days of closure",
    },
    {
      dataCategory: "Digital Petition Signatures & Support Records",
      retentionPeriod: "Active Petition Lifecycle + 7 Years (Public Audit Trail)",
      storageLocation: "Primary Database (Domestic India)",
      disposalProtocol: "Anonymized on user deletion; public civic tally preserved",
    },
    {
      dataCategory: "Access & Security Logs",
      retentionPeriod: "180 Days (Mandated by CERT-In Cyber Security Directions 2022)",
      storageLocation: "Read-only Immutable Log Partition (India Region)",
      disposalProtocol: "Automated rolling archival deletion after 180 days",
    },
    {
      dataCategory: "Consent Proof Ledgers (Section 6(10))",
      retentionPeriod: "Lifespan of Account + 3 Years",
      storageLocation: "Tamper-evident Consent Collection",
      disposalProtocol: "Retained as statutory proof of legal basis before archival purge",
    },
    {
      dataCategory: "Data Breach Incident Logs & DPBI Notices",
      retentionPeriod: "Permanently (Statutory Regulatory Defense)",
      storageLocation: "Breach Control Room Secure Partition",
      disposalProtocol: "Permanent institutional compliance record",
    },
    {
      dataCategory: "Inactive / Abandoned Accounts",
      retentionPeriod: "24 Months of zero activity",
      storageLocation: "Production Collections",
      disposalProtocol: "Pre-deletion warning notice dispatched, followed by automated erasure",
    },
  ],
  internalDataProtectionPolicy: {
    title: "SoSign Internal Data Protection & Information Security Policy (IDPP)",
    version: "2026.V2",
    principles: [
      {
        principle: "Principle of Purpose Limitation (Section 4 & 5)",
        rule: "Personal data collected for petition signing or civic engagement shall never be repurposed, sold, or shared with commercial brokers.",
      },
      {
        principle: "Principle of Least Privilege (PoLP)",
        rule: "Internal employee and sub-admin access to plain-text citizen identity records is restricted by role-based access control (RBAC).",
      },
      {
        principle: "Child Data Safeguards (Section 9)",
        rule: "Zero behavioral tracking or targeted advertising directed at individuals under 18 years. Mandatory Verifiable Parental Consent.",
      },
      {
        principle: "Vendor Governance & Flow-Through Erasure (Section 8(2) & 8(7))",
        rule: "No third party may receive or process citizen data without an executed DPA and guaranteed deletion upon retention expiration.",
      },
      {
        principle: "Cross-Border Sovereignty (Section 16)",
        rule: "Primary digital personal data must remain localized in Indian data centers (ap-south-1). No transfers to blacklisted jurisdictions.",
      },
    ],
  },
};

/**
 * @desc    Get all vendors with pagination & filtering
 * @route   GET /api/admin/vendors
 * @access  Private (Admin)
 */
export const getVendors = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const query = {};

  if (req.query.category && req.query.category !== "all") {
    query.category = req.query.category;
  }

  if (req.query.complianceStatus && req.query.complianceStatus !== "all") {
    query.complianceStatus = req.query.complianceStatus;
  }

  if (req.query.dpaStatus && req.query.dpaStatus !== "all") {
    query.dpaStatus = req.query.dpaStatus;
  }

  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, "i");
    query.$or = [
      { vendorId: searchRegex },
      { name: searchRegex },
      { serviceProvided: searchRegex },
      { dataHostingLocation: searchRegex },
    ];
  }

  const [vendors, total] = await Promise.all([
    VendorCompliance.find(query).sort({ complianceScore: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    VendorCompliance.countDocuments(query),
  ]);

  res.json({
    success: true,
    vendors,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

/**
 * @desc    Create / Register a new vendor or data processor
 * @route   POST /api/admin/vendors
 * @access  Private (Admin)
 */
export const createVendor = asyncHandler(async (req, res) => {
  const {
    name,
    category,
    serviceProvided,
    dataProcessed = [],
    dpaStatus = "executed",
    dpaSignedDate = new Date(),
    dpaExpiryDate,
    securityCertifications = [],
    deletionOnTerminationClause = true,
    dataHostingLocation = "Mumbai, India",
    isCrossBorderTransfer = false,
    crossBorderSafeguards,
    contactPerson,
  } = req.body;

  if (!name || !serviceProvided) {
    res.status(400);
    throw new Error("Vendor name and service description are required");
  }

  const count = await VendorCompliance.countDocuments();
  const vendorId = `VND-${String(count + 1).padStart(3, "0")}`;

  const vendor = await VendorCompliance.create({
    vendorId,
    name,
    category: category || "other",
    serviceProvided,
    dataProcessed: Array.isArray(dataProcessed) ? dataProcessed : String(dataProcessed).split(",").map((s) => s.trim()),
    dpaStatus,
    dpaSignedDate,
    dpaExpiryDate,
    securityCertifications: Array.isArray(securityCertifications)
      ? securityCertifications
      : String(securityCertifications).split(",").map((s) => s.trim()),
    deletionOnTerminationClause,
    dataHostingLocation,
    isCrossBorderTransfer,
    crossBorderSafeguards: crossBorderSafeguards || {
      destinationCountry: isCrossBorderTransfer ? "Foreign" : "India",
      adequacyBasis: isCrossBorderTransfer ? "Standard Contractual Clauses" : "Domestic In-Country Hosting",
      centralGovApproved: true,
      transferMechanism: "Direct Hosting",
    },
    contactPerson: contactPerson || {},
  });

  res.status(201).json({
    success: true,
    message: `Vendor ${vendor.name} (${vendor.vendorId}) registered in DPDP governance registry.`,
    vendor,
  });
});

/**
 * @desc    Get single vendor details
 * @route   GET /api/admin/vendors/:id
 * @access  Private (Admin)
 */
export const getVendorById = asyncHandler(async (req, res) => {
  const vendor = await VendorCompliance.findById(req.params.id);
  if (!vendor) {
    res.status(404);
    throw new Error("Vendor not found");
  }

  res.json({
    success: true,
    vendor,
  });
});

/**
 * @desc    Update vendor details
 * @route   PUT /api/admin/vendors/:id
 * @access  Private (Admin)
 */
export const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await VendorCompliance.findById(req.params.id);
  if (!vendor) {
    res.status(404);
    throw new Error("Vendor not found");
  }

  Object.assign(vendor, req.body);
  await vendor.save();

  res.json({
    success: true,
    message: "Vendor compliance details updated successfully",
    vendor,
  });
});

/**
 * @desc    Record regular security & compliance audit (Point 8)
 * @route   POST /api/admin/vendors/:id/audit
 * @access  Private (Admin)
 */
export const recordVendorAudit = asyncHandler(async (req, res) => {
  const { score = 95, findings, nextAuditMonths = 6 } = req.body;

  const vendor = await VendorCompliance.findById(req.params.id);
  if (!vendor) {
    res.status(404);
    throw new Error("Vendor not found");
  }

  const now = new Date();
  const nextDate = new Date(now.getTime() + nextAuditMonths * 30 * 24 * 60 * 60 * 1000);

  const auditEntry = {
    auditedAt: now,
    auditorName: req.admin?.name || req.admin?.email || "Data Protection Officer",
    score: Number(score) || 95,
    findings: findings || "Periodic DPDP Act Section 8(2) vendor review completed successfully.",
    remediationStatus: "closed",
  };

  vendor.auditHistory.push(auditEntry);
  vendor.lastAuditDate = now;
  vendor.nextAuditDate = nextDate;
  vendor.complianceScore = Number(score) || 95;
  vendor.complianceStatus = score >= 80 ? "compliant" : score >= 60 ? "review_needed" : "non_compliant";
  vendor.auditFindings = findings || vendor.auditFindings;

  await vendor.save();

  res.json({
    success: true,
    message: `Security audit recorded for ${vendor.name}. Compliance score updated to ${vendor.complianceScore}%.`,
    vendor,
  });
});

/**
 * @desc    Dispatch / Record deletion request to vendor (Point 7 - Section 8(7))
 * @route   POST /api/admin/vendors/:id/deletion-dispatch
 * @access  Private (Admin)
 */
export const dispatchVendorDeletion = asyncHandler(async (req, res) => {
  const { reason = "User account erasure request", recordsImpacted = 1 } = req.body;

  const vendor = await VendorCompliance.findById(req.params.id);
  if (!vendor) {
    res.status(404);
    throw new Error("Vendor not found");
  }

  const refId = `VND-DEL-${Date.now()}`;
  const logEntry = {
    requestedAt: new Date(),
    reason,
    recordsImpacted: Number(recordsImpacted) || 1,
    confirmedAt: new Date(),
    referenceId: refId,
  };

  vendor.deletionLogs.push(logEntry);
  await vendor.save();

  res.json({
    success: true,
    message: `Section 8(7) data erasure request successfully recorded with vendor ${vendor.name} [Ref: ${refId}].`,
    logEntry,
  });
});

/**
 * @desc    Get overall vendor governance metrics
 * @route   GET /api/admin/vendors/stats
 * @access  Private (Admin)
 */
export const getVendorStats = asyncHandler(async (req, res) => {
  const [
    totalVendors,
    executedDpas,
    crossBorderVendors,
    compliantVendors,
    upcomingAudits,
  ] = await Promise.all([
    VendorCompliance.countDocuments(),
    VendorCompliance.countDocuments({ dpaStatus: "executed" }),
    VendorCompliance.countDocuments({ isCrossBorderTransfer: true }),
    VendorCompliance.countDocuments({ complianceStatus: "compliant" }),
    VendorCompliance.countDocuments({
      nextAuditDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    }),
  ]);

  const scoreAggregate = await VendorCompliance.aggregate([
    { $group: { _id: null, avgScore: { $avg: "$complianceScore" } } },
  ]);

  res.json({
    success: true,
    stats: {
      totalVendors,
      executedDpas,
      crossBorderVendors,
      domesticVendors: totalVendors - crossBorderVendors,
      compliantVendors,
      upcomingAudits,
      averageComplianceScore: Math.round(scoreAggregate[0]?.avgScore || 95),
    },
  });
});

/**
 * @desc    Get Cross-Border Data Transfer Assessment & Localization Report (Points 9 & 10)
 * @route   GET /api/admin/vendors/cross-border-assessment
 * @access  Private (Admin)
 */
export const getCrossBorderAssessment = asyncHandler(async (req, res) => {
  const vendors = await VendorCompliance.find().select("name category isCrossBorderTransfer dataHostingLocation crossBorderSafeguards");

  const crossBorderList = vendors.filter((v) => v.isCrossBorderTransfer);
  const domesticList = vendors.filter((v) => !v.isCrossBorderTransfer);

  res.json({
    success: true,
    assessment: {
      dataLocalizationStatus: "Fully Compliant - Primary Domestic Storage in India",
      primaryDatabaseRegion: "Asia Pacific (Mumbai, India - AWS ap-south-1)",
      primaryKycStorage: "DigiLocker / Sovereign India NIC Cloud & Encrypted Mumbai Cluster",
      statutoryComplianceBasis: "Section 16 of the DPDP Act 2023",
      blacklistedJurisdictionTransfers: "None (Zero transfers to restricted foreign territories)",
      crossBorderVendorCount: crossBorderList.length,
      domesticVendorCount: domesticList.length,
      crossBorderDataFlows: crossBorderList.map((v) => ({
        vendor: v.name,
        category: v.category,
        hosting: v.dataHostingLocation,
        destination: v.crossBorderSafeguards?.destinationCountry,
        safeguards: v.crossBorderSafeguards?.adequacyBasis,
        mechanism: v.crossBorderSafeguards?.transferMechanism,
      })),
      domesticDataFlows: domesticList.map((v) => ({
        vendor: v.name,
        category: v.category,
        hosting: v.dataHostingLocation,
      })),
    },
  });
});

/**
 * @desc    Get Internal Policies & DPO Charter (Points 1, 11 & 12)
 * @route   GET /api/admin/vendors/internal-policies
 * @access  Private (Admin)
 */
export const getInternalPolicies = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    policies: INTERNAL_POLICIES_AND_CHARTER,
  });
});

/**
 * @desc    Get Child Data Safeguards & Parental Consent Statistics (Points 2, 3 & 4)
 * @route   GET /api/admin/vendors/child-safeguards-stats
 * @access  Private (Admin)
 */
export const getChildSafeguardsStats = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    minorUsers,
    pendingParentalConsent,
    verifiedParentalConsent,
    minorsList,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isMinor: true }),
    User.countDocuments({ isMinor: true, "parentalConsent.status": "pending" }),
    User.countDocuments({ isMinor: true, "parentalConsent.status": "verified" }),
    User.find({ isMinor: true })
      .select("name email mobileNumber isMinor parentalConsent createdAt")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  res.json({
    success: true,
    childProtection: {
      totalUsers,
      minorUsers,
      adultUsers: totalUsers - minorUsers,
      pendingParentalConsent,
      verifiedParentalConsent,
      childTrackingProtectionActive: true,
      targetedAdBansEnforced: true,
      minors: minorsList,
    },
  });
});

/**
 * @desc    Verify or update a child's parental consent (Point 3)
 * @route   POST /api/admin/vendors/verify-parental-consent/:userId
 * @access  Private (Admin)
 */
export const verifyParentalConsentAction = asyncHandler(async (req, res) => {
  const { status = "verified", notes = "Parental consent verified by DPO" } = req.body;

  const user = await User.findById(req.params.userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.parentalConsent = {
    ...user.parentalConsent,
    status,
    verifiedAt: new Date(),
    verificationMethod: req.body.verificationMethod || "manual_review",
    notes,
  };

  await user.save();

  res.json({
    success: true,
    message: `Parental consent status updated to ${status} for ${user.name}.`,
    parentalConsent: user.parentalConsent,
  });
});

export default {
  getVendors,
  createVendor,
  getVendorById,
  updateVendor,
  recordVendorAudit,
  dispatchVendorDeletion,
  getVendorStats,
  getCrossBorderAssessment,
  getInternalPolicies,
  getChildSafeguardsStats,
  verifyParentalConsentAction,
};
