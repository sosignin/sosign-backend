import asyncHandler from "express-async-handler";
import RequestedSignatureClaim from "../models/requestedSignatureClaimModel.js";
import Petition from "../models/petitionModel.js";
import User from "../models/userModel.js";
import { sendEmail } from "../config/emailConfig.js";

// @desc    Submit a verification claim for a requested signature
// @route   POST /api/petitions/:petitionId/claim-requested-signature
// @access  Private
export const submitClaim = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;
  const {
    requestedSignerId,
    claimantName,
    claimantEmail,
    claimantPhone,
    claimType,
    message,
  } = req.body;

  let proofDocumentUrl = req.body.proofDocumentUrl?.trim() || "";
  let videoUrl = req.body.videoUrl?.trim() || "";

  // Check if files were uploaded via multipart/form-data
  if (req.processedClaimFiles?.video?.path) {
    videoUrl = req.processedClaimFiles.video.path;
  }
  if (req.processedClaimFiles?.proofDocument?.path) {
    proofDocumentUrl = req.processedClaimFiles.proofDocument.path;
  }

  if (!requestedSignerId || !claimantName || !claimantEmail) {
    res.status(400);
    throw new Error("Requested signer ID, claimant name, and email are required.");
  }

  if (!proofDocumentUrl && !videoUrl) {
    res.status(400);
    throw new Error("Please provide verification proof: upload a video, enter a video link, or provide a proof document.");
  }

  // Find target petition
  const petition = await Petition.findById(petitionId);
  if (!petition) {
    res.status(404);
    throw new Error("Petition not found.");
  }

  // Find requested signer in petition
  const requestedSigner = petition.requestedSigners?.id(requestedSignerId);
  if (!requestedSigner) {
    res.status(404);
    throw new Error("Requested signer not found on this petition.");
  }

  // Check if requested signer is already verified signed
  if (requestedSigner.isVerifiedSigned) {
    res.status(400);
    throw new Error("This requested signature has already been verified and signed.");
  }

  // Check if user has already submitted a pending claim for this requested signer
  const existingClaim = await RequestedSignatureClaim.findOne({
    petition: petitionId,
    requestedSignerId: requestedSignerId,
    claimant: req.user._id,
    status: "Pending",
  });

  if (existingClaim) {
    res.status(400);
    throw new Error("You already have a pending verification claim for this requested signature.");
  }

  // Create claim
  const claim = await RequestedSignatureClaim.create({
    petition: petitionId,
    requestedSignerId: requestedSignerId,
    requestedSignerName: requestedSigner.name,
    requestedSignerDesignation: requestedSigner.designation || "",
    claimant: req.user._id,
    claimantName: claimantName.trim(),
    claimantEmail: claimantEmail.trim().toLowerCase(),
    claimantPhone: claimantPhone?.trim() || "",
    claimType: claimType || "self",
    proofDocumentUrl: proofDocumentUrl.trim(),
    videoUrl: videoUrl.trim(),
    message: message?.trim() || "",
    status: "Pending",
  });

  // Notify Admin via email
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
  if (adminEmail) {
    const adminDashboardUrl = `${process.env.ADMIN_URL || "https://admin.sosign.in"}/dashboard/requested-signature-claims`;
    const emailSubject = `✍️ NEW SIGNATURE CLAIM: Verification requested for "${requestedSigner.name}" on "${petition.title}"`;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; background: #f8fafc; color: #1e293b; padding: 20px; }
          .card { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 24px; border: 1px solid #e2e8f0; }
          .header { background: #0284c7; color: #fff; padding: 16px; border-radius: 12px; text-align: center; }
          .box { background: #f1f5f9; padding: 14px; border-radius: 10px; margin-top: 12px; font-size: 14px; }
          .btn { display: inline-block; background: #0284c7; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h3>✍️ Requested Signature Verification Claim</h3>
            <p>Verification request submitted for ${requestedSigner.name}</p>
          </div>
          <div class="box">
            <p><strong>Petition:</strong> ${petition.title}</p>
            <p><strong>Requested Signer:</strong> ${requestedSigner.name} (${requestedSigner.designation || "N/A"})</p>
            <p><strong>Claimant Name:</strong> ${claimantName}</p>
            <p><strong>Claimant Email:</strong> ${claimantEmail}</p>
            <p><strong>Claim Type:</strong> ${claimType === "self" ? "Self (" + requestedSigner.name + ")" : "Authorized Manager / Representative"}</p>
            ${proofDocumentUrl ? `<p><strong>Proof Document:</strong> <a href="${proofDocumentUrl}" target="_blank">${proofDocumentUrl}</a></p>` : ""}
            ${videoUrl ? `<p><strong>Verification Video:</strong> <a href="${videoUrl}" target="_blank">${videoUrl}</a></p>` : ""}
            ${message ? `<p><strong>Notes:</strong> ${message}</p>` : ""}
          </div>
          <div style="text-align: center;">
            <a href="${adminDashboardUrl}" class="btn">Review Claim in Admin Dashboard</a>
          </div>
        </div>
      </body>
      </html>
    `;
    sendEmail(adminEmail, emailSubject, emailHtml).catch(() => {});
  }

  res.status(201).json({
    message: "Verification claim submitted successfully. Admin will review your proof and approve the signature.",
    claim,
  });
});

// @desc    Get all requested signature claims for admin
// @route   GET /api/admin/requested-signature-claims
// @access  Private/Admin
export const getAdminClaims = asyncHandler(async (req, res) => {
  const { status, search } = req.query;

  const query = {};
  if (status && status !== "All") {
    query.status = status;
  }

  let claims = await RequestedSignatureClaim.find(query)
    .populate({
      path: "petition",
      select: "title slug status numberOfSignatures requestedSigners",
    })
    .populate({
      path: "claimant",
      select: "name email mobileNumber aadhaarKyc profilePicture",
    })
    .sort({ createdAt: -1 });

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    claims = claims.filter(
      (c) =>
        c.requestedSignerName?.toLowerCase().includes(s) ||
        c.claimantName?.toLowerCase().includes(s) ||
        c.claimantEmail?.toLowerCase().includes(s) ||
        c.petition?.title?.toLowerCase().includes(s)
    );
  }

  res.json({ claims });
});

// @desc    Approve a requested signature claim
// @route   PUT /api/admin/requested-signature-claims/:claimId/approve
// @access  Private/Admin
export const approveClaim = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const { adminNotes } = req.body;

  const claim = await RequestedSignatureClaim.findById(claimId);
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found.");
  }

  if (claim.status === "Approved") {
    res.status(400);
    throw new Error("This claim is already approved.");
  }

  const petition = await Petition.findById(claim.petition);
  if (!petition) {
    res.status(404);
    throw new Error("Target petition not found.");
  }

  // Find requested signer in petition
  const requestedSigner = petition.requestedSigners?.id(claim.requestedSignerId);
  if (!requestedSigner) {
    // Fallback: match by name if ID was modified
    const matchedRS = petition.requestedSigners?.find(
      (rs) => rs.name.trim().toLowerCase() === claim.requestedSignerName.trim().toLowerCase()
    );
    if (!matchedRS) {
      res.status(404);
      throw new Error("Requested signer not found in petition requestedSigners list.");
    }
    matchedRS.isVerifiedSigned = true;
    matchedRS.verifiedSignedBy = claim.claimant;
    matchedRS.verifiedClaimId = claim._id;
  } else {
    requestedSigner.isVerifiedSigned = true;
    requestedSigner.verifiedSignedBy = claim.claimant;
    requestedSigner.verifiedClaimId = claim._id;
  }

  // Check if claimant signature is already present in petition.signatures
  const hasUserSigned = petition.signatures?.some(
    (s) => s.user?.toString() === claim.claimant.toString()
  );

  if (!hasUserSigned) {
    petition.signatures.push({
      user: claim.claimant,
      signedAt: new Date(),
    });
    petition.numberOfSignatures = (petition.numberOfSignatures || 0) + 1;
  }

  await petition.save();

  // Update claim status
  claim.status = "Approved";
  claim.adminNotes = adminNotes || "Approved by admin after proof verification.";
  claim.actionTakenAt = new Date();
  await claim.save();

  // Notify claimant via email
  if (claim.claimantEmail) {
    const petitionUrl = `${process.env.FRONTEND_URL || "https://sosign.in"}/currentpetitions/${petition.slug || petition._id}`;
    const emailSubject = `🎉 Verification Approved! Requested signature for "${claim.requestedSignerName}" marked as SIGNED`;
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px;">
          <h3 style="color: #166534;">🎉 Verification Claim Approved!</h3>
          <p>Hello <strong>${claim.claimantName}</strong>,</p>
          <p>Your verification claim for requested signature <strong>${claim.requestedSignerName}</strong> on petition <strong>"${petition.title}"</strong> has been reviewed and approved by the SoSign Admin team.</p>
          <p>The signature is now officially marked as <span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:4px; font-weight:bold;">SIGNED</span> on the campaign details page!</p>
          <p><a href="${petitionUrl}" style="display:inline-block; background:#166534; color:#fff; text-decoration:none; padding:10px 18px; border-radius:8px; font-weight:bold;">View Petition Page</a></p>
        </div>
      </body>
      </html>
    `;
    sendEmail(claim.claimantEmail, emailSubject, emailHtml).catch(() => {});
  }

  res.json({
    message: "Requested signature claim approved successfully and signature counted!",
    claim,
  });
});

// @desc    Reject a requested signature claim
// @route   PUT /api/admin/requested-signature-claims/:claimId/reject
// @access  Private/Admin
export const rejectClaim = asyncHandler(async (req, res) => {
  const { claimId } = req.params;
  const { adminNotes } = req.body;

  const claim = await RequestedSignatureClaim.findById(claimId);
  if (!claim) {
    res.status(404);
    throw new Error("Claim not found.");
  }

  claim.status = "Rejected";
  claim.adminNotes = adminNotes || "Rejected by admin after review.";
  claim.actionTakenAt = new Date();
  await claim.save();

  res.json({
    message: "Requested signature claim rejected.",
    claim,
  });
});
