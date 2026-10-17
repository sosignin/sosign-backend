import mongoose from "mongoose";

const consentLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    userName: {
      type: String,
      default: "Anonymous Visitor",
      trim: true,
    },
    userEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
    consentType: {
      type: String,
      required: true,
      enum: [
        "registration",
        "terms_and_privacy",
        "cookie_banner",
        "petition_signature",
        "aadhaar_kyc",
        "grievance_submission",
        "marketing_communications",
        "analytics_tracking",
        "data_erasure_request",
        "consent_withdrawal",
      ],
      index: true,
    },
    purpose: {
      type: String,
      required: true,
      default: "Processing of digital personal data in accordance with DPDP Act 2023",
    },
    noticeVersion: {
      type: String,
      default: "2026.1-DPDP",
    },
    noticeLanguage: {
      type: String,
      default: "en", // English or Eighth Schedule language: hi, bn, mr, ta, te, gu, kn, ml, pa, or, ur, as
      index: true,
    },
    granted: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    method: {
      type: String,
      default: "affirmative_checkbox",
      enum: [
        "affirmative_checkbox",
        "button_click",
        "granular_switch",
        "cookie_banner",
        "newsletter_checkbox",
        "contact_checkbox",
        "contact_form_checkbox",
        "signature_modal",
        "api",
      ],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

consentLogSchema.index({ createdAt: -1 });

const ConsentLog =
  mongoose.models.ConsentLog || mongoose.model("ConsentLog", consentLogSchema);

export default ConsentLog;
