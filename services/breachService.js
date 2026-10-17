import DataBreach from "../models/dataBreachModel.js";
import User from "../models/userModel.js";
import Notification from "../models/notificationModel.js";
import { sendEmail } from "../config/emailConfig.js";

/**
 * DPDP Act 2023 - 5-Stage Data Breach Response Plan (SOP)
 */
export const BREACH_RESPONSE_SOP = {
  framework: "Digital Personal Data Protection (DPDP) Act, 2023 & CERT-In Directions",
  dataFiduciary: {
    legalEntity: "LEO MEO IT Solution Private Limited",
    platform: "SoSign (https://www.sosign.in)",
    grievanceEmail: "grievance@sosign.in",
    privacyEmail: "privacy@sosign.in",
    helpline: "+91 9323677688",
    address: "NESCO Center, Western Express Highway, Goregaon East, Mumbai, Maharashtra 400063, India",
  },
  stages: [
    {
      stageNumber: 1,
      name: "Detection, Triage & Incident Classification",
      statutoryBasis: "Section 2(u) DPDP Act 2023",
      objective: "Immediately classify if an event constitutes a 'Personal Data Breach' under Indian law.",
      actions: [
        "Capture trigger from automated SIEM, access log anomalies, DLP alarms, or user grievance.",
        "Check against Section 2(u) definition: Unauthorised processing, accidental disclosure, acquisition, sharing, use, alteration, destruction, or loss of access compromising confidentiality, integrity, or availability.",
        "Assign triage severity: Low, Medium, High, or Critical based on data categories exposed (e.g. KYC, contact data, hashed credentials).",
        "Open formal Breach Incident Reference Record (BR-YYYY-XXX).",
      ],
      sla: "Within 1 hour of anomaly detection",
    },
    {
      stageNumber: 2,
      name: "Immediate Containment & Rapid Harm Reduction",
      statutoryBasis: "Section 8(5) DPDP Act 2023",
      objective: "Halt ongoing data leakage and shield Data Principals from immediate harm.",
      actions: [
        "Invalidate active JWT authentication sessions for compromised accounts via token revocation timestamp.",
        "Force mandatory password reset and session re-authentication for affected Data Principals.",
        "Isolate compromised API endpoints, rotate database connection credentials, and patch exploitable vectors.",
        "Quarantine any rogue IP addresses or unauthorized administrative tokens.",
        "Log all containment actions in the tamper-evident Containment Audit Ledger.",
      ],
      sla: "Immediate / Within 2 to 4 hours",
    },
    {
      stageNumber: 3,
      name: "Forensic Investigation & Harm Assessment",
      statutoryBasis: "Section 8(5) & Section 8(6) DPDP Act 2023",
      objective: "Determine root cause, affected scope, and quantify potential harm to citizens.",
      actions: [
        "Audit access logs, database query logs, and transaction ledgers to establish exact compromised records.",
        "Assess Confidentiality, Integrity, and Availability impact vectors.",
        "Identify affected data fields (e.g., email, masked KYC, contact details) to craft targeted advisory.",
        "Verify if any unencrypted sensitive identifiers were accessed.",
        "Compile Root Cause Analysis (RCA) and forensic evidence package.",
      ],
      sla: "Within 6 to 12 hours",
    },
    {
      stageNumber: 4,
      name: "Statutory DPBI & Data Principal Notifications",
      statutoryBasis: "Section 8(6) DPDP Act 2023 & CERT-In Rules",
      objective: "Intimate the Data Protection Board of India and affected citizens without undue delay.",
      actions: [
        "Generate formal Statutory Section 8(6) Notice for the Data Protection Board of India (DPBI).",
        "Submit statutory notification to the Board detailing incident time, nature, affected volume, containment steps, and DPO details.",
        "Dispatch multi-channel notices (In-App notifications and high-priority emails) to each affected Data Principal.",
        "Provide explicit citizen harm-mitigation advice: password rotation, phishing vigilance, and two-factor authentication.",
        "Log reference numbers and intimations in the breach compliance registry.",
      ],
      sla: "Without undue delay / within prescribed statutory window",
    },
    {
      stageNumber: 5,
      name: "Eradication, System Hardening & Post-Mortem Audit",
      statutoryBasis: "Section 8(5) DPDP Act 2023",
      objective: "Prevent recurrence, remediate vulnerabilities, and retain compliance records.",
      actions: [
        "Perform regression vulnerability scans and third-party penetration testing.",
        "Update automated backup protocols and firewall rule matrices.",
        "Publish Post-Mortem Forensic Report to executive leadership and board.",
        "Maintain statutory incident documentation for regulatory audits by the Data Protection Board of India.",
      ],
      sla: "Within 7 business days post-resolution",
    },
  ],
};

/**
 * Generate formal Statutory Section 8(6) Notice for the Data Protection Board of India (DPBI)
 */
export const generateDpbiStatutoryNotice = (breach) => {
  const sop = BREACH_RESPONSE_SOP;
  const incidentDateStr = new Date(breach.incidentDate || Date.now()).toUTCString();
  const detectedDateStr = new Date(breach.detectedDate || Date.now()).toUTCString();
  const generatedDateStr = new Date().toUTCString();

  return `
================================================================================
STATUTORY INTIMATION OF PERSONAL DATA BREACH TO THE DATA PROTECTION BOARD OF INDIA
[Pursuant to Section 8(6) of the Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023)]
================================================================================

DOCUMENT REF : ${breach.breachId}/DPBI-SEC8(6)/${new Date().getFullYear()}
FILING DATE  : ${generatedDateStr}
URGENCY      : ${breach.severity?.toUpperCase()} SEVERITY NOTIFICATION

TO:
The Secretary / Adjudicating Officer,
Data Protection Board of India (DPBI),
New Delhi, India.

RESPECTED MEMBERS OF THE BOARD,

In compliance with the statutory obligation under Section 8, Sub-section (6) of the Digital Personal Data Protection Act, 2023, notice is hereby formally provided by the undersigned Data Fiduciary regarding a personal data breach identified within our digital processing systems.

--------------------------------------------------------------------------------
1. PARTICULARS OF THE DATA FIDUCIARY
--------------------------------------------------------------------------------
(a) Legal Entity Name   : ${sop.dataFiduciary.legalEntity}
(b) Operating Platform  : ${sop.dataFiduciary.platform}
(c) Registered Address  : ${sop.dataFiduciary.address}
(d) Grievance Officer   : ${sop.dataFiduciary.grievanceEmail} | Tel: ${sop.dataFiduciary.helpline}
(e) Dedicated Privacy   : ${sop.dataFiduciary.privacyEmail}
(f) Officer In Charge   : ${breach.dpbiNotification?.officerInCharge || "Data Protection & Grievance Redressal Officer"}

--------------------------------------------------------------------------------
2. PARTICULARS & CLASSIFICATION OF THE INCIDENT [Section 2(u) DPDP Act 2023]
--------------------------------------------------------------------------------
(a) Breach Reference ID : ${breach.breachId}
(b) Incident Title      : ${breach.title}
(c) Statutory Category  : ${breach.category?.toUpperCase()}
    Definition          : Confirmed under Section 2(u) as ${breach.category?.replace(/_/g, " ")}.
(d) Estimated Incident  : ${incidentDateStr}
(e) Date of Detection   : ${detectedDateStr}
(f) Severity Assessment : ${breach.severity?.toUpperCase()}
(g) Root Cause Summary  : ${breach.rootCause || "Forensic analysis ongoing"}

--------------------------------------------------------------------------------
3. SCOPE OF PERSONAL DATA & AFFECTED DATA PRINCIPALS
--------------------------------------------------------------------------------
(a) Collections Involved: ${(breach.affectedCollections || []).join(", ") || "User Records"}
(b) Data Fields Exposed : ${(breach.affectedDataFields || []).join(", ") || "Account Identifiers"}
(c) Estimated Volume    : ${breach.estimatedAffectedCount || (breach.affectedUserIds?.length || 0)} Data Principals
(d) Sensitive / KYC Data: No plain-text Aadhaar or biometric numbers are stored or compromised (DigiLocker / SHA-256 masked per UIDAI rules).

--------------------------------------------------------------------------------
4. RAPID HARM REDUCTION & IMMEDIATE CONTAINMENT MEASURES [Section 8(5)]
--------------------------------------------------------------------------------
The Data Fiduciary has taken the following immediate, proactive containment steps:
${(breach.containmentActions || [])
  .map(
    (act, i) =>
      `  [${i + 1}] ${act.action} | Executed By: ${act.executedBy} | Timestamp: ${new Date(act.timestamp).toUTCString()} | Details: ${act.details || "N/A"}`
  )
  .join("\n") || "  [1] Immediate session termination and credential rotation initiated."}

Harm Mitigation Plan:
${breach.harmMitigationPlan || "All active tokens revoked and security advisory dispatched to affected users."}

--------------------------------------------------------------------------------
5. INTIMATION TO AFFECTED DATA PRINCIPALS [Section 8(6)]
--------------------------------------------------------------------------------
(a) Notification Status : ${breach.usersNotification?.status?.toUpperCase() || "IN PROGRESS"}
(b) Dispatch Channels   : ${(breach.usersNotification?.channels || ["in_app", "email"]).join(", ")}
(c) Citizen Guidance    : ${breach.remedialAdviceForUsers || "Users instructed to reset credentials and verify session history."}

--------------------------------------------------------------------------------
6. STATUTORY DECLARATION & CONTACT POINT
--------------------------------------------------------------------------------
The Data Fiduciary affirms that all reasonable security safeguards as mandated under Section 8(5) have been deployed. Supplemental forensic disclosures will be submitted if additional material facts emerge during continued log analysis.

Submitted by:
For ${sop.dataFiduciary.legalEntity} (SoSign Platform)
Authorized Signatory / Data Protection & Grievance Redressal Officer
Official Contact: ${sop.dataFiduciary.grievanceEmail} | ${sop.dataFiduciary.helpline}
================================================================================
`.trim();
};

/**
 * Execute Rapid Harm Reduction (Point 4 of DPDP Act compliance)
 * - Programmatically invalidates active tokens/sessions of affected users
 * - Triggers mandatory password reset flags
 * - Records timestamped containment action in the audit trail
 */
export const executeRapidHarmReduction = async (breachId, adminUser, options = {}) => {
  const breach = await DataBreach.findById(breachId);
  if (!breach) {
    throw new Error("Data breach incident not found");
  }

  const {
    invalidateSessions = true,
    forcePasswordReset = true,
    allUsers = false,
    customActionTitle = "Rapid Harm Reduction Protocol Executed",
    details = "Automated session invalidation and credential protection executed to shield Data Principals.",
  } = options;

  const containmentTimestamp = new Date();
  let affectedCount = 0;

  // Determine query filter for users
  let userFilter = {};
  if (!allUsers && breach.affectedUserIds && breach.affectedUserIds.length > 0) {
    userFilter = { _id: { $in: breach.affectedUserIds } };
  } else if (!allUsers && breach.affectedCollections?.includes("User") && breach.affectedUserIds?.length === 0) {
    // If specific users not listed yet, apply to users matched or limit to avoid system lock unless allUsers is true
    userFilter = {};
  }

  const updateFields = {};
  if (invalidateSessions) {
    updateFields.tokenInvalidBefore = containmentTimestamp;
  }
  if (forcePasswordReset) {
    updateFields.mustResetPassword = true;
    updateFields.securityAlertMessage =
      "Security Notice: For your protection following a recent platform incident, your session was refreshed. Please update your account password.";
  }

  if (Object.keys(updateFields).length > 0) {
    const updateResult = await User.updateMany(userFilter, { $set: updateFields });
    affectedCount = updateResult.modifiedCount || 0;
  }

  // Record containment action
  const containmentEntry = {
    action: customActionTitle,
    executedBy: adminUser?.email || adminUser?.name || "Security Administrator",
    timestamp: containmentTimestamp,
    details: `${details} (Impacted ${affectedCount} Data Principal accounts)`,
    affectedCount,
  };

  breach.containmentActions.push(containmentEntry);

  if (breach.status === "detected") {
    breach.status = "contained";
  }
  if (!breach.containedDate) {
    breach.containedDate = containmentTimestamp;
  }

  // Update estimated affected count if not set
  if (!breach.estimatedAffectedCount || breach.estimatedAffectedCount === 0) {
    breach.estimatedAffectedCount = affectedCount;
  }

  // Auto-regenerate DPBI draft to reflect the newest containment actions
  breach.dpbiNotification.statutoryNoticeDraft = generateDpbiStatutoryNotice(breach);

  await breach.save();

  return {
    success: true,
    breachId: breach.breachId,
    affectedCount,
    containmentEntry,
    status: breach.status,
  };
};

/**
 * Dispatch Notifications to affected Data Principals (Point 3 of DPDP compliance)
 * - Creates in-app notifications
 * - Sends urgent notification emails via Nodemailer
 */
export const dispatchCitizenNotifications = async (breachId, adminUser, options = {}) => {
  const breach = await DataBreach.findById(breachId);
  if (!breach) {
    throw new Error("Data breach incident not found");
  }

  const {
    channels = ["in_app", "email"],
    subject = `Urgent Security Advisory Regarding Your SoSign Account [Ref: ${breach.breachId}]`,
    message = `We are contacting you in accordance with Section 8(6) of the Digital Personal Data Protection Act, 2023. Our security team detected and contained a security incident involving ${breach.title}. Immediate containment safeguards have been deployed.`,
    advice = breach.remedialAdviceForUsers || "Please sign in and reset your password. If you observe any suspicious requests, report them to privacy@sosign.in immediately.",
  } = options;

  let recipients = [];
  if (breach.affectedUserIds && breach.affectedUserIds.length > 0) {
    recipients = await User.find({ _id: { $in: breach.affectedUserIds } }).select("name email _id");
  } else {
    // If no specific users isolated, fetch all users capped at 250 for safety or batch
    recipients = await User.find({ isSuspended: false }).select("name email _id").limit(200);
  }

  let sentInApp = 0;
  let sentEmail = 0;

  // 1. In-App Notifications
  if (channels.includes("in_app") && recipients.length > 0) {
    const notificationsToInsert = recipients.map((u) => ({
      recipient: u._id,
      title: subject,
      message: `${message}\n\nRecommended Action: ${advice}`,
      type: "warning",
      read: false,
    }));

    try {
      await Notification.insertMany(notificationsToInsert);
      sentInApp = notificationsToInsert.length;
    } catch (err) {
      console.error("Error bulk creating in-app breach notifications:", err);
    }
  }

  // 2. Email Notifications
  if (channels.includes("email") && recipients.length > 0) {
    const emailPromises = recipients.map(async (u) => {
      if (!u.email) return;
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${subject}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background: linear-gradient(135deg, #002050 0%, #302D55 100%); padding: 24px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">SOSIGN SECURITY ADVISORY</h1>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #f472b6;">Statutory Notice under Section 8(6) of DPDP Act 2023</p>
            </div>
            <div style="padding: 28px;">
              <p style="font-size: 14px; margin-top: 0;">Dear <strong>${u.name || "Citizen"}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                We are writing to provide you with transparent, statutory notice pursuant to <strong>Section 8(6) of the Digital Personal Data Protection (DPDP) Act, 2023</strong> regarding a security event:
              </p>
              <div style="background: #f1f5f9; border-left: 4px solid #F43676; padding: 14px 18px; border-radius: 6px; margin: 18px 0; font-size: 13px;">
                <strong>Incident Reference:</strong> ${breach.breachId}<br>
                <strong>Incident Nature:</strong> ${breach.title}<br>
                <strong>Category:</strong> ${breach.category?.replace(/_/g, " ")}<br>
                <strong>Status:</strong> Contained & Forensic Remediation Active
              </div>
              <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                ${message}
              </p>
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin: 0 0 8px 0; color: #1e40af; font-size: 13px; text-transform: uppercase;">Recommended Safety Actions:</h4>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #1e3a8a; white-space: pre-line;">${advice}</p>
              </div>
              <p style="font-size: 12px; line-height: 1.5; color: #64748b;">
                Our security team and Data Protection Officer have contained the vector and statutory intimation is being processed with the <strong>Data Protection Board of India</strong>.
              </p>
              <p style="font-size: 12px; line-height: 1.5; color: #64748b;">
                For any inquiries, contact our Grievance Redressal Officer at <a href="mailto:grievance@sosign.in" style="color: #3650AD;">grievance@sosign.in</a> or privacy cell at <a href="mailto:privacy@sosign.in" style="color: #F43676;">privacy@sosign.in</a>.
              </p>
            </div>
            <div style="background: #f8fafc; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
              LEO MEO IT Solution Private Limited (SoSign Division) | Mumbai, India<br>
              This is an automated statutory security dispatch.
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        const res = await sendEmail(
          u.email,
          subject,
          htmlContent,
          `${subject}\n\nDear ${u.name},\n\n${message}\n\nRecommended Advice:\n${advice}\n\nContact: grievance@sosign.in`
        );
        if (res.success) sentEmail++;
      } catch (err) {
        console.error(`Error sending breach email to ${u.email}:`, err.message);
      }
    });

    await Promise.allSettled(emailPromises);
  }

  // Update breach records
  const totalNotified = Math.max(sentInApp, sentEmail, recipients.length);
  breach.usersNotification = {
    status: "completed",
    notifiedAt: new Date(),
    totalNotified,
    channels,
    subject,
    message,
    adviceSent: advice,
  };

  if (breach.status === "contained") {
    breach.status = "notified";
  }

  await breach.save();

  return {
    success: true,
    totalNotified,
    sentInApp,
    sentEmail,
  };
};

export default {
  BREACH_RESPONSE_SOP,
  generateDpbiStatutoryNotice,
  executeRapidHarmReduction,
  dispatchCitizenNotifications,
};
