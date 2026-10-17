import mongoose from "mongoose";

const vendorComplianceSchema = new mongoose.Schema(
  {
    vendorId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Vendor name is required"],
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "payment_gateway",
        "cloud_hosting",
        "identity_kyc",
        "email_sms",
        "analytics_logs",
        "legal_audit",
        "other",
      ],
      default: "other",
      index: true,
    },
    serviceProvided: {
      type: String,
      required: true,
    },
    // Point 5: Personal data elements processed by this vendor
    dataProcessed: {
      type: [String],
      default: [],
    },
    // Point 5: Data Processing Agreement (DPA) status & safeguards
    dpaStatus: {
      type: String,
      enum: ["executed", "under_review", "exempt", "expired"],
      default: "executed",
      index: true,
    },
    dpaSignedDate: {
      type: Date,
      default: Date.now,
    },
    dpaExpiryDate: {
      type: Date,
      default: null,
    },
    dpaDocumentRef: {
      type: String,
      default: "SOSIGN-DPA-STD-2026",
    },
    // Point 6: Vendor Data Protection Requirements & Certifications
    securityCertifications: {
      type: [String],
      default: ["ISO 27001", "SOC 2 Type II", "TLS 1.3 / AES-256"],
    },
    encryptionInTransit: {
      type: Boolean,
      default: true,
    },
    encryptionAtRest: {
      type: Boolean,
      default: true,
    },
    // Point 7: Requirement for vendors to delete or return data
    deletionOnTerminationClause: {
      type: Boolean,
      default: true, // Mandated by DPDP Act Section 8(7)
    },
    deletionVerificationMethod: {
      type: String,
      default: "Automated API erasure with cryptographic certificate of destruction upon contract termination or user erasure request.",
    },
    deletionLogs: [
      {
        requestedAt: { type: Date, default: Date.now },
        reason: { type: String, default: "User account erasure / retention expiration" },
        recordsImpacted: { type: Number, default: 1 },
        confirmedAt: { type: Date, default: Date.now },
        referenceId: String,
      },
    ],
    // Point 8: Regular Security & Compliance Monitoring
    complianceStatus: {
      type: String,
      enum: ["compliant", "review_needed", "non_compliant"],
      default: "compliant",
      index: true,
    },
    complianceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 95,
    },
    lastAuditDate: {
      type: Date,
      default: Date.now,
    },
    nextAuditDate: {
      type: Date,
      default: () => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months audit cycle
    },
    auditFindings: {
      type: String,
      default: "Audit passed with zero high-risk non-conformities. Security controls verified in alignment with DPDP Act 2023.",
    },
    auditHistory: [
      {
        auditedAt: { type: Date, default: Date.now },
        auditorName: { type: String, default: "SoSign Data Protection Officer" },
        score: { type: Number, default: 95 },
        findings: String,
        remediationStatus: { type: String, default: "closed" },
      },
    ],
    // Points 9 & 10: Cross-Border Data Transfer & Localization
    isCrossBorderTransfer: {
      type: Boolean,
      default: false,
    },
    dataHostingLocation: {
      type: String,
      default: "Mumbai, India (AWS ap-south-1)",
    },
    crossBorderSafeguards: {
      destinationCountry: { type: String, default: "India" },
      adequacyBasis: { type: String, default: "Primary domestic storage in India" },
      centralGovApproved: { type: Boolean, default: true },
      transferMechanism: { type: String, default: "Local Hosting / Standard Contractual Clauses (SCC)" },
    },
    contactPerson: {
      name: { type: String, default: "Compliance Department" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

// Pre-seed known platform vendors
vendorComplianceSchema.statics.seedDefaults = async function () {
  const count = await this.countDocuments();
  if (count > 0) return;

  const defaultVendors = [
    {
      vendorId: "VND-PAY-001",
      name: "Razorpay Software Private Limited",
      category: "payment_gateway",
      serviceProvided: "Payment gateway processing for citizen petition donations & crowdfunding wallet top-ups",
      dataProcessed: ["name", "email", "mobileNumber", "transactionAmount", "orderId"],
      dpaStatus: "executed",
      dpaSignedDate: new Date("2025-01-15"),
      dpaExpiryDate: new Date("2027-01-15"),
      dpaDocumentRef: "RZP-DPA-2025-IN",
      securityCertifications: ["PCI-DSS 4.0 Level 1", "ISO 27001:2013", "SOC 2 Type II"],
      encryptionInTransit: true,
      encryptionAtRest: true,
      deletionOnTerminationClause: true,
      deletionVerificationMethod: "Automated API token revocation & tokenized card identifier purge within 48h.",
      complianceStatus: "compliant",
      complianceScore: 98,
      lastAuditDate: new Date("2026-06-10"),
      nextAuditDate: new Date("2026-12-10"),
      auditFindings: "Verified PCI-DSS Level 1 certification and compliant Indian data localization per RBI & DPDP directives.",
      isCrossBorderTransfer: false,
      dataHostingLocation: "Mumbai & Hyderabad, India",
      crossBorderSafeguards: {
        destinationCountry: "India",
        adequacyBasis: "Domestic Data Localization Mandate (RBI & DPDP Act)",
        centralGovApproved: true,
        transferMechanism: "Local Tier-4 Data Center",
      },
      contactPerson: {
        name: "Razorpay Compliance & Risk Team",
        email: "dpo@razorpay.com",
        phone: "+91 80 4666 9555",
      },
    },
    {
      vendorId: "VND-PAY-002",
      name: "Cashfree Payments India Private Limited",
      category: "payment_gateway",
      serviceProvided: "Secondary payment gateway and payout disbursements for verified community campaigns",
      dataProcessed: ["name", "email", "mobileNumber", "bankAccountNumber", "ifscCode"],
      dpaStatus: "executed",
      dpaSignedDate: new Date("2025-02-01"),
      dpaExpiryDate: new Date("2027-02-01"),
      dpaDocumentRef: "CF-DPA-2025-DPDP",
      securityCertifications: ["PCI-DSS Level 1", "ISO 27001", "CERT-In Empaneled Auditor Reviewed"],
      encryptionInTransit: true,
      encryptionAtRest: true,
      deletionOnTerminationClause: true,
      complianceStatus: "compliant",
      complianceScore: 96,
      lastAuditDate: new Date("2026-05-15"),
      nextAuditDate: new Date("2026-11-15"),
      auditFindings: "Payout verification endpoints secured with HMAC-SHA256 and IP allowlisting.",
      isCrossBorderTransfer: false,
      dataHostingLocation: "Bangalore & Mumbai, India",
      crossBorderSafeguards: {
        destinationCountry: "India",
        adequacyBasis: "Domestic Data Localization",
        centralGovApproved: true,
        transferMechanism: "Local Cloud Region",
      },
      contactPerson: {
        name: "Cashfree Risk Cell",
        email: "compliance@cashfree.com",
        phone: "+91 80 4710 3999",
      },
    },
    {
      vendorId: "VND-KYC-001",
      name: "DigiLocker / National Informatics Centre (MeitY)",
      category: "identity_kyc",
      serviceProvided: "Statutory paperless Aadhaar KYC authentication via DigiLocker Government Gateway",
      dataProcessed: ["maskedAadhaar", "fullName", "dob", "gender", "maskedAddress"],
      dpaStatus: "executed",
      dpaSignedDate: new Date("2024-11-10"),
      dpaExpiryDate: new Date("2027-11-10"),
      dpaDocumentRef: "MEITY-DIGILOCKER-MOU-2024",
      securityCertifications: ["Government of India Security Architecture", "Aadhaar Act 2016 Compliant", "ISO 27001"],
      encryptionInTransit: true,
      encryptionAtRest: true,
      deletionOnTerminationClause: true,
      deletionVerificationMethod: "Zero permanent biometric or full Aadhaar storage per UIDAI Regulations 2016.",
      complianceStatus: "compliant",
      complianceScore: 100,
      lastAuditDate: new Date("2026-07-01"),
      nextAuditDate: new Date("2027-01-01"),
      auditFindings: "Fully aligned with UIDAI Circular on Aadhaar data masking and SPDI rules.",
      isCrossBorderTransfer: false,
      dataHostingLocation: "New Delhi & Bhubaneswar, India (NIC Cloud)",
      crossBorderSafeguards: {
        destinationCountry: "India",
        adequacyBasis: "National Sovereign Cloud Infrastructure",
        centralGovApproved: true,
        transferMechanism: "NIC Gov Data Center",
      },
      contactPerson: {
        name: "DigiLocker Grievance Officer",
        email: "support@digitallocker.gov.in",
        phone: "+91 11 2430 1999",
      },
    },
    {
      vendorId: "VND-KYC-002",
      name: "PlanAPI Solutions Private Limited",
      category: "identity_kyc",
      serviceProvided: "Direct API verification for citizen PAN card and Election Commission Voter IDs",
      dataProcessed: ["panNumber", "voterId", "registeredName", "fatherName"],
      dpaStatus: "executed",
      dpaSignedDate: new Date("2025-03-20"),
      dpaExpiryDate: new Date("2026-12-31"),
      dpaDocumentRef: "PLANAPI-DPA-2025-V2",
      securityCertifications: ["ISO 27001:2022", "SOC 2 Type II", "VAPT Cleared"],
      encryptionInTransit: true,
      encryptionAtRest: true,
      deletionOnTerminationClause: true,
      complianceStatus: "compliant",
      complianceScore: 94,
      lastAuditDate: new Date("2026-04-12"),
      nextAuditDate: new Date("2026-10-12"),
      auditFindings: "Ephemeral lookup verification; no raw government database mirrors stored.",
      isCrossBorderTransfer: false,
      dataHostingLocation: "Mumbai, India",
      crossBorderSafeguards: {
        destinationCountry: "India",
        adequacyBasis: "Domestic Data Center",
        centralGovApproved: true,
        transferMechanism: "Standard Contractual Safeguards",
      },
      contactPerson: {
        name: "PlanAPI Support",
        email: "support@planapi.in",
        phone: "+91 22 6900 1200",
      },
    },
    {
      vendorId: "VND-CLD-001",
      name: "Amazon Web Services India Private Limited (AWS)",
      category: "cloud_hosting",
      serviceProvided: "Cloud hosting infrastructure, virtual servers, encrypted network isolation",
      dataProcessed: ["encryptedUserDatabase", "applicationLogs", "systemBackups"],
      dpaStatus: "executed",
      dpaSignedDate: new Date("2024-08-01"),
      dpaExpiryDate: new Date("2027-08-01"),
      dpaDocumentRef: "AWS-INDIA-DPA-DPDP-2024",
      securityCertifications: ["ISO 27001", "ISO 27017", "ISO 27018", "SOC 1/2/3", "MeitY Empaneled Cloud Service Provider"],
      encryptionInTransit: true,
      encryptionAtRest: true,
      deletionOnTerminationClause: true,
      deletionVerificationMethod: "Cryptographic deletion of EBS volumes & automated retention lifecycle purge.",
      complianceStatus: "compliant",
      complianceScore: 99,
      lastAuditDate: new Date("2026-08-10"),
      nextAuditDate: new Date("2027-02-10"),
      auditFindings: "Region pinned to Asia Pacific (Mumbai) ap-south-1. MeitY cloud compliance verified.",
      isCrossBorderTransfer: false,
      dataHostingLocation: "Mumbai & Hyderabad (ap-south-1), India",
      crossBorderSafeguards: {
        destinationCountry: "India",
        adequacyBasis: "MeitY Empaneled Domestic Cloud Services",
        centralGovApproved: true,
        transferMechanism: "Direct In-Country Hosting",
      },
      contactPerson: {
        name: "AWS India Security & Privacy Officer",
        email: "aws-india-dpa@amazon.com",
        phone: "+91 22 4000 0000",
      },
    },
    {
      vendorId: "VND-MED-001",
      name: "Cloudinary Inc. (Global Media CDN)",
      category: "cloud_hosting",
      serviceProvided: "Public petition hero images, user avatars, and compressed civic media CDN delivery",
      dataProcessed: ["publicProfileImages", "petitionBannerImages"],
      dpaStatus: "executed",
      dpaSignedDate: new Date("2025-01-10"),
      dpaExpiryDate: new Date("2027-01-10"),
      dpaDocumentRef: "CLOUDINARY-GLOBAL-DPA-2025",
      securityCertifications: ["ISO 27001", "SOC 2 Type II", "GDPR & DPDP Standard Contractual Clauses"],
      encryptionInTransit: true,
      encryptionAtRest: true,
      deletionOnTerminationClause: true,
      deletionVerificationMethod: "Public assets deleted permanently via Cloudinary Admin API upon petition/user erasure.",
      complianceStatus: "compliant",
      complianceScore: 92,
      lastAuditDate: new Date("2026-07-20"),
      nextAuditDate: new Date("2027-01-20"),
      auditFindings: "Public media only; zero confidential KYC or plain-text PII transferred or processed.",
      isCrossBorderTransfer: true,
      dataHostingLocation: "Global Edge Network (India Edge POPs: Mumbai, Chennai, Delhi)",
      crossBorderSafeguards: {
        destinationCountry: "Global Edge Network / United States",
        adequacyBasis: "Standard Contractual Clauses (SCC) with end-to-end TLS 1.3 encryption for public media assets only",
        centralGovApproved: true,
        transferMechanism: "Standard Contractual Clauses & Strict Data Minimization (Public Media Only)",
      },
      contactPerson: {
        name: "Cloudinary Privacy Officer",
        email: "privacy@cloudinary.com",
        phone: "+1 650 488 4000",
      },
    },
  ];

  await this.insertMany(defaultVendors);
  console.log("Pre-seeded 6 statutory DPDP vendors in VendorCompliance registry.");
};

const VendorCompliance =
  mongoose.models.VendorCompliance || mongoose.model("VendorCompliance", vendorComplianceSchema);

export default VendorCompliance;
