import asyncHandler from "express-async-handler";
import PetitionReport from "../models/petitionReportModel.js";
import Petition from "../models/petitionModel.js";
import User from "../models/userModel.js";
import { sendEmail } from "../config/emailConfig.js";

// @desc    Submit a formal objection / report against a petition (Requires Aadhaar KYC)
// @route   POST /api/reports/petition
// @access  Private
export const submitPetitionReport = asyncHandler(async (req, res) => {
  const { petitionId, reason, description, evidenceUrl } = req.body;

  if (!petitionId || !reason || !description) {
    res.status(400);
    throw new Error("Petition ID, reason, and description are required.");
  }

  // Mandatory Aadhaar KYC verification check
  const isAadhaarVerified = req.user?.aadhaarKyc?.status === "verified";
  if (!isAadhaarVerified) {
    res.status(403);
    throw new Error(
      "Aadhaar KYC Verification Required: Only verified users with completed Aadhaar KYC can submit formal petition objections."
    );
  }

  // Check if petition exists
  const petition = await Petition.findById(petitionId);
  if (!petition) {
    res.status(404);
    throw new Error("Petition not found.");
  }

  // Check if user has already submitted a pending objection report for this petition
  const existingReport = await PetitionReport.findOne({
    petition: petitionId,
    reporter: req.user._id,
    status: { $in: ["Pending", "Under Review"] },
  });

  if (existingReport) {
    res.status(400);
    throw new Error(
      "You have already submitted an active objection report for this petition. It is currently under review by our admin team."
    );
  }

  // Create report
  const report = await PetitionReport.create({
    petition: petitionId,
    reporter: req.user._id,
    reason,
    description,
    evidenceUrl: evidenceUrl || "",
    reporterAadhaarName: req.user.aadhaarKyc?.name || req.user.name,
    reporterMaskedAadhaar: req.user.aadhaarKyc?.maskedAadhaar || "",
    status: "Pending",
  });

  // Send instant email notification to Admin for immediate review
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
  if (adminEmail) {
    const adminDashboardUrl = `${process.env.ADMIN_URL || "https://admin.sosign.in"}/dashboard/petition-reports`;
    const petitionUrl = `${process.env.FRONTEND_URL || "https://sosign.in"}/currentpetitions/${petition.slug || petition._id}`;

    const emailSubject = `🚨 URGENT: Petition Objection Report Received for "${petition.title}"`;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #dc2626 0%, #9f1239 100%); color: #ffffff; padding: 24px; text-align: center; }
          .header h2 { margin: 0; font-size: 20px; font-weight: 800; }
          .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 24px; }
          .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px; font-size: 14px; }
          .badge { display: inline-block; background: #ffe4e6; color: #9f1239; font-weight: bold; padding: 4px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 10px; }
          .aadhaar-badge { display: inline-block; background: #dcfce7; color: #166534; font-weight: bold; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
          .btn { display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 10px; font-size: 14px; text-align: center; }
          .footer { padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🚨 Formal Petition Objection Report</h2>
            <p>An Aadhaar-verified user has submitted an objection requiring immediate review</p>
          </div>
          <div class="content">
            <div class="box">
              <p style="margin:0 0 8px 0;"><strong>Target Petition:</strong> ${petition.title}</p>
              <p style="margin:0 0 8px 0;"><strong>Category:</strong> ${petition.category || "General"}</p>
              <p style="margin:0 0 8px 0;"><strong>Total Signatures:</strong> ${petition.numberOfSignatures || 0}</p>
              <p style="margin:0;"><a href="${petitionUrl}" target="_blank" style="color:#0284c7; text-decoration: underline;">View Public Petition Page &rarr;</a></p>
            </div>

            <div class="box">
              <span class="badge">OBJECTION REASON: ${reason}</span>
              <p style="margin:8px 0 4px 0;"><strong>Detailed Description / Justification:</strong></p>
              <p style="white-space: pre-wrap; background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; margin:0 0 10px 0;">${description}</p>
              ${evidenceUrl ? `<p style="margin:0;"><strong>Supporting Evidence / URL:</strong> <a href="${evidenceUrl}" target="_blank" style="color:#0284c7;">${evidenceUrl}</a></p>` : ""}
            </div>

            <div class="box">
              <p style="margin:0 0 8px 0;"><strong>Reporter (Aadhaar Verified):</strong> ${req.user.aadhaarKyc?.name || req.user.name}</p>
              <p style="margin:0 0 8px 0;"><strong>Email:</strong> ${req.user.email}</p>
              <p style="margin:0;"><strong>Identity Status:</strong> <span class="aadhaar-badge">Aadhaar Verified (${req.user.aadhaarKyc?.maskedAadhaar || "Verified"})</span></p>
            </div>

            <div style="text-align: center; margin-top: 24px;">
              <a href="${adminDashboardUrl}" class="btn">Open Admin Dashboard & Take Down Petition</a>
            </div>
          </div>
          <div class="footer">
            SoSign Automated Trust & Safety Alert System
          </div>
        </div>
      </body>
      </html>
    `;

    // Fire and forget email task in background
    sendEmail(adminEmail, emailSubject, emailHtml).catch((err) => {
      console.error("Failed to send admin petition report alert email:", err);
    });
  }

  res.status(201).json({
    message: "Objection report submitted successfully. Our compliance team will review it.",
    report,
  });
});

// @desc    Get all petition objection reports for admin
// @route   GET /api/admin/petition-reports
// @access  Private/Admin
export const getAdminPetitionReports = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 10 } = req.query;

  const query = {};

  if (status && status !== "All") {
    query.status = status;
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  let reports = await PetitionReport.find(query)
    .populate({
      path: "petition",
      select: "title slug status category numberOfSignatures image country isApproved rejectionReason",
    })
    .populate({
      path: "reporter",
      select: "name email mobileNumber aadhaarKyc profilePicture",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // If search filter provided, filter by petition title or reporter name/email
  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    reports = reports.filter((r) => {
      const petitionTitle = r.petition?.title?.toLowerCase() || "";
      const reporterName = r.reporter?.name?.toLowerCase() || "";
      const reporterEmail = r.reporter?.email?.toLowerCase() || "";
      const reason = r.reason?.toLowerCase() || "";
      return (
        petitionTitle.includes(s) ||
        reporterName.includes(s) ||
        reporterEmail.includes(s) ||
        reason.includes(s)
      );
    });
  }

  const totalReports = await PetitionReport.countDocuments(query);

  res.json({
    reports,
    page: pageNum,
    pages: Math.ceil(totalReports / limitNum),
    totalReports,
  });
});

// @desc    Update petition report status & admin notes
// @route   PUT /api/admin/petition-reports/:id/status
// @access  Private/Admin
export const updatePetitionReportStatus = asyncHandler(async (req, res) => {
  const { status, adminNotes } = req.body;

  const report = await PetitionReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Objection report not found.");
  }

  if (status) report.status = status;
  if (adminNotes !== undefined) report.adminNotes = adminNotes;
  report.actionTakenAt = new Date();

  await report.save();

  res.json({
    message: "Report status updated successfully.",
    report,
  });
});

// @desc    Take down petition based on objection report
// @route   PUT /api/admin/petition-reports/:id/takedown
// @access  Private/Admin
export const takeDownPetitionFromReport = asyncHandler(async (req, res) => {
  const { adminNotes } = req.body;

  const report = await PetitionReport.findById(req.params.id).populate("petition");
  if (!report) {
    res.status(404);
    throw new Error("Objection report not found.");
  }

  const petition = await Petition.findById(report.petition._id || report.petition);
  if (!petition) {
    res.status(404);
    throw new Error("Associated petition not found.");
  }

  // Take down the petition: mark status as rejected/taken-down and update rejectionReason
  petition.status = "rejected";
  petition.isApproved = false;
  petition.rejectionReason =
    adminNotes || `Taken down by platform admin due to formal objection report (${report.reason}).`;

  await petition.save();

  // Update report status
  report.status = "Resolved (Taken Down)";
  if (adminNotes) report.adminNotes = adminNotes;
  report.actionTakenAt = new Date();
  await report.save();

  res.json({
    message: `Petition "${petition.title}" has been taken down successfully.`,
    report,
    petition,
  });
});
