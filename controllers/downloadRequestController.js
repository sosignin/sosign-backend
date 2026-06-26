import asyncHandler from "express-async-handler";
import DownloadRequest, { AVAILABLE_FIELDS } from "../models/downloadRequestModel.js";
import Petition from "../models/petitionModel.js";
import Comment from "../models/commentModel.js";

// @desc    Create a download request for a petition
// @route   POST /api/download-requests
// @access  Private
const createDownloadRequest = asyncHandler(async (req, res) => {
    // Check if user is on the platinum plan
    if (req.user?.plan !== "platinum") {
        res.status(403);
        throw new Error("Only users on the Platinum plan can request petition data downloads.");
    }

    const { petitionId, reason, requestedFields } = req.body;

    if (!petitionId || !reason) {
        res.status(400);
        throw new Error("Please provide petition ID and reason for download request");
    }

    if (reason.length > 500) {
        res.status(400);
        throw new Error("Reason cannot exceed 500 characters");
    }

    // Validate and filter requestedFields
    let validatedFields = AVAILABLE_FIELDS; // Default to all fields
    if (requestedFields && Array.isArray(requestedFields) && requestedFields.length > 0) {
        validatedFields = requestedFields.filter(field => AVAILABLE_FIELDS.includes(field));
        if (validatedFields.length === 0) {
            res.status(400);
            throw new Error("Please select at least one valid data field to request");
        }
    }

    // Check if petition exists
    const petition = await Petition.findById(petitionId);
    if (!petition) {
        res.status(404);
        throw new Error("Petition not found");
    }

    // Check if user already has a pending request for this petition
    const existingRequest = await DownloadRequest.findOne({
        petition: petitionId,
        user: req.user._id,
        status: "pending",
    });

    if (existingRequest) {
        res.status(400);
        throw new Error("You already have a pending download request for this petition");
    }

    // Create the download request
    const downloadRequest = await DownloadRequest.create({
        petition: petitionId,
        user: req.user._id,
        reason: reason.trim(),
        requestedFields: validatedFields,
    });

    res.status(201).json({
        success: true,
        message: "Download request submitted successfully. Please wait for admin approval.",
        request: downloadRequest,
        availableFields: AVAILABLE_FIELDS, // Send available fields for reference
    });
});

// @desc    Get user's download requests
// @route   GET /api/download-requests/my-requests
// @access  Private
const getUserDownloadRequests = asyncHandler(async (req, res) => {
    const requests = await DownloadRequest.find({ user: req.user._id })
        .populate("petition", "title _id")
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        requests,
    });
});

// @desc    Check download request status for a specific petition
// @route   GET /api/download-requests/check/:petitionId
// @access  Private
const checkDownloadRequestStatus = asyncHandler(async (req, res) => {
    const { petitionId } = req.params;

    const request = await DownloadRequest.findOne({
        petition: petitionId,
        user: req.user._id,
    }).sort({ createdAt: -1 }); // Get the most recent request

    if (!request) {
        return res.status(200).json({
            success: true,
            hasRequest: false,
            canRequest: true,
            canDownload: false,
            availableFields: AVAILABLE_FIELDS,
        });
    }

    res.status(200).json({
        success: true,
        hasRequest: true,
        status: request.status,
        canRequest: request.status === "rejected", // Can request again if rejected
        canDownload: request.status === "approved",
        requestedFields: request.requestedFields,
        approvedFields: request.approvedFields,
        availableFields: AVAILABLE_FIELDS,
        request,
    });
});

// @desc    Download petition data (if approved)
// @route   GET /api/download-requests/download/:petitionId
// @access  Private
const downloadPetitionData = asyncHandler(async (req, res) => {
    const { petitionId } = req.params;

    // Check if user has an approved request
    const request = await DownloadRequest.findOne({
        petition: petitionId,
        user: req.user._id,
        status: "approved",
    });

    if (!request) {
        res.status(403);
        throw new Error("You do not have permission to download this petition data. Please request access first.");
    }

    // Get approved fields - default to all if empty (for backward compatibility)
    const approvedFields = request.approvedFields && request.approvedFields.length > 0
        ? request.approvedFields
        : AVAILABLE_FIELDS;

    // Fetch petition with all related data
    const petition = await Petition.findById(petitionId)
        .populate("petitionStarter.user", "name email designation")
        .populate("signatures.user", "name email designation");

    if (!petition) {
        res.status(404);
        throw new Error("Petition not found");
    }

    // Fetch all approved comments for this petition (only if comments are approved)
    let comments = [];
    if (approvedFields.includes("comments")) {
        comments = await Comment.find({
            petition: petitionId,
            isApproved: true,
        })
            .populate("user", "name email designation")
            .sort({ createdAt: -1 });
    }

    // Update download count and track download
    request.downloadCount += 1;
    request.downloadedAt = new Date();
    await request.save();

    // Import PDFKit dynamically
    const PDFDocument = (await import("pdfkit")).default;

    // Create PDF document
    const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
            Title: `Petition: ${petition.title}`,
            Author: "SOSIGN Platform",
            Subject: "Petition Data Export",
            CreationDate: new Date(),
        },
    });

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="petition-${petition._id}-data.pdf"`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Helper function for adding sections
    const addSectionHeader = (text) => {
        doc.moveDown(0.5);
        doc.fontSize(14).fillColor("#3650AD").font("Helvetica-Bold").text(text);
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
    doc.rect(0, 0, 612, 100).fill("#3650AD");
    doc.fontSize(24).fillColor("#ffffff").font("Helvetica-Bold").text("SOSIGN", 50, 30);
    doc.fontSize(12).fillColor("#ffffff").font("Helvetica").text("Petition Data Export", 50, 60);
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`, 50, 78);

    doc.moveDown(3);
    doc.y = 120;

    // ===== PETITION TITLE =====
    doc.fontSize(18).fillColor("#1a1a2e").font("Helvetica-Bold").text(petition.title, { align: "center" });
    doc.moveDown(1);

    // ===== PETITION DETAILS ===== (if approved)
    if (approvedFields.includes("petitionDetails")) {
        addSectionHeader("PETITION DETAILS");
        addLabelValue("Petition ID", petition._id.toString());
        addLabelValue("Country", petition.country);
        addLabelValue("Categories", petition.categories?.join(", ") || "N/A");
        addLabelValue("Status", petition.approved ? "Approved" : "Pending Approval");
        addLabelValue("Created At", new Date(petition.createdAt).toLocaleDateString());
        addLabelValue("Last Updated", new Date(petition.updatedAt).toLocaleDateString());

        // Problem & Solution are part of petition details
        if (petition.petitionDetails?.problem) {
            addSectionHeader("PROBLEM");
            doc.fontSize(10).font("Helvetica").text(petition.petitionDetails.problem, { align: "justify" });
        }

        if (petition.petitionDetails?.solution) {
            addSectionHeader("SOLUTION");
            doc.fontSize(10).font("Helvetica").text(petition.petitionDetails.solution, { align: "justify" });
        }
    }

    // ===== PETITION STARTER ===== (if approved)
    if (approvedFields.includes("petitionStarter")) {
        addSectionHeader("PETITION STARTER");
        addLabelValue("Name", petition.petitionStarter?.name || petition.petitionStarter?.user?.name || "Anonymous");
        addLabelValue("Location", petition.petitionStarter?.location || "N/A");
        if (petition.petitionStarter?.comment) {
            doc.moveDown(0.3);
            doc.fontSize(10).font("Helvetica-Oblique").text(`"${petition.petitionStarter.comment}"`, { indent: 20 });
        }
    }

    // ===== DECISION MAKERS ===== (if approved)
    if (approvedFields.includes("decisionMakers") && petition.decisionMakers && petition.decisionMakers.length > 0) {
        addSectionHeader("DECISION MAKERS");
        petition.decisionMakers.forEach((dm, index) => {
            doc.fontSize(10).font("Helvetica").text(`${index + 1}. ${dm.name}${dm.organization ? ` (${dm.organization})` : ""}${dm.email ? ` - ${dm.email}` : ""}`);
        });
    }

    // ===== STATISTICS ===== (if approved)
    if (approvedFields.includes("statistics")) {
        addSectionHeader("STATISTICS");
        const totalSignatures = petition.numberOfSignatures || petition.signatures?.length || 0;
        doc.fontSize(12).font("Helvetica-Bold").fillColor("#F43676").text(`Total Signatures: ${totalSignatures}`);
        doc.fillColor("#333333").fontSize(10).font("Helvetica").text(`Total Comments: ${comments.length}`);
    }

    // ===== SIGNATURES LIST ===== (if approved)
    if (approvedFields.includes("signatures") && petition.signatures && petition.signatures.length > 0) {
        // Only add new page if not enough space (less than 200px remaining)
        if (doc.y > 650) {
            doc.addPage();
        } else {
            doc.moveDown(1);
        }
        addSectionHeader(`SIGNATURES (${petition.signatures.length} total)`);

        // Table header
        const tableTop = doc.y;
        const tableLeft = 50;
        doc.fontSize(9).font("Helvetica-Bold");
        doc.text("#", tableLeft, tableTop, { width: 30 });
        doc.text("Name", tableLeft + 30, tableTop, { width: 150 });
        doc.text("Email", tableLeft + 180, tableTop, { width: 180 });
        doc.text("Signed At", tableLeft + 360, tableTop, { width: 100 });
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e0e0e0").stroke();
        doc.moveDown(0.3);

        // Table rows
        doc.font("Helvetica").fontSize(8);
        petition.signatures.slice(0, 100).forEach((sig, index) => {
            if (doc.y > 750) {
                doc.addPage();
                doc.y = 50;
            }
            const rowY = doc.y;
            doc.text(`${index + 1}`, tableLeft, rowY, { width: 30 });
            doc.text(sig.user?.name || "Anonymous", tableLeft + 30, rowY, { width: 150 });
            doc.text(sig.user?.email || "N/A", tableLeft + 180, rowY, { width: 180 });
            doc.text(sig.signedAt ? new Date(sig.signedAt).toLocaleDateString() : "N/A", tableLeft + 360, rowY, { width: 100 });
            doc.moveDown(0.5);
        });

        if (petition.signatures.length > 100) {
            doc.moveDown(0.5);
            doc.fontSize(9).font("Helvetica-Oblique").text(`... and ${petition.signatures.length - 100} more signatures`);
        }
    }

    // ===== COMMENTS ===== (if approved)
    if (approvedFields.includes("comments") && comments.length > 0) {
        // Only add new page if not enough space (less than 200px remaining)
        if (doc.y > 650) {
            doc.addPage();
        } else {
            doc.moveDown(1);
        }
        addSectionHeader(`COMMENTS (${comments.length} total)`);

        comments.slice(0, 50).forEach((comment, index) => {
            if (doc.y > 700) {
                doc.addPage();
                doc.y = 50;
            }
            doc.fontSize(9).font("Helvetica-Bold").text(`${index + 1}. ${comment.user?.name || "Anonymous"}`, { continued: true });
            doc.font("Helvetica").fontSize(8).fillColor("#666666").text(` - ${new Date(comment.createdAt).toLocaleDateString()}`);
            doc.fillColor("#333333").fontSize(9).font("Helvetica").text(comment.content, { indent: 15 });
            doc.moveDown(0.5);
        });

        if (comments.length > 50) {
            doc.fontSize(9).font("Helvetica-Oblique").text(`... and ${comments.length - 50} more comments`);
        }
    }

    // ===== APPROVED FIELDS NOTICE =====
    doc.moveDown(1.5);
    doc.fontSize(8).fillColor("#666666").font("Helvetica-Oblique").text(
        `Approved data fields: ${approvedFields.join(", ")}`,
        { align: "center" }
    );

    // ===== FOOTER =====
    doc.moveDown(1);
    doc.fontSize(8).fillColor("#999999").font("Helvetica").text(
        `This document was exported from SOSIGN by ${req.user.name} (${req.user.email}) on ${new Date().toISOString()}`,
        { align: "center" }
    );

    // Finalize PDF
    doc.end();
});

// =====================
// ADMIN ROUTES
// =====================

// @desc    Get all download requests (Admin)
// @route   GET /api/download-requests/admin/all
// @access  Admin
const getAllDownloadRequests = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
        filter.status = status;
    }

    const requests = await DownloadRequest.find(filter)
        .populate("petition", "title _id")
        .populate("user", "name email designation")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const totalRequests = await DownloadRequest.countDocuments(filter);

    res.status(200).json({
        success: true,
        requests,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRequests / parseInt(limit)),
        totalRequests,
    });
});

// @desc    Get pending download requests count (Admin)
// @route   GET /api/download-requests/admin/pending-count
// @access  Admin
const getPendingRequestsCount = asyncHandler(async (req, res) => {
    const count = await DownloadRequest.countDocuments({ status: "pending" });

    res.status(200).json({
        success: true,
        count,
    });
});

// @desc    Approve a download request (Admin)
// @route   PUT /api/download-requests/admin/:id/approve
// @access  Admin
const approveDownloadRequest = asyncHandler(async (req, res) => {
    const { adminNote, approvedFields } = req.body;

    const request = await DownloadRequest.findById(req.params.id);

    if (!request) {
        res.status(404);
        throw new Error("Download request not found");
    }

    if (request.status !== "pending") {
        res.status(400);
        throw new Error("This request has already been processed");
    }

    // Validate and set approvedFields
    // If no approvedFields provided, approve all requested fields
    let validatedApprovedFields = request.requestedFields;

    if (approvedFields && Array.isArray(approvedFields) && approvedFields.length > 0) {
        // Ensure approvedFields are a subset of requestedFields
        validatedApprovedFields = approvedFields.filter(field =>
            request.requestedFields.includes(field) && AVAILABLE_FIELDS.includes(field)
        );

        if (validatedApprovedFields.length === 0) {
            res.status(400);
            throw new Error("Please approve at least one valid data field");
        }
    }

    request.status = "approved";
    request.approvedBy = req.admin?.username || "admin";
    request.approvedAt = new Date();
    request.approvedFields = validatedApprovedFields;

    if (adminNote) {
        request.adminNote = adminNote.trim();
    }

    await request.save();

    res.status(200).json({
        success: true,
        message: "Download request approved successfully",
        request,
    });
});

// @desc    Reject a download request (Admin)
// @route   PUT /api/download-requests/admin/:id/reject
// @access  Admin
const rejectDownloadRequest = asyncHandler(async (req, res) => {
    const { adminNote } = req.body;

    const request = await DownloadRequest.findById(req.params.id);

    if (!request) {
        res.status(404);
        throw new Error("Download request not found");
    }

    if (request.status !== "pending") {
        res.status(400);
        throw new Error("This request has already been processed");
    }

    request.status = "rejected";
    request.approvedBy = req.admin?.username || "admin";
    request.approvedAt = new Date();
    if (adminNote) {
        request.adminNote = adminNote.trim();
    }

    await request.save();

    res.status(200).json({
        success: true,
        message: "Download request rejected",
        request,
    });
});

// @desc    Admin direct download petition data (no approval needed)
// @route   GET /api/download-requests/admin/download/:petitionId
// @access  Admin
const adminDownloadPetitionData = asyncHandler(async (req, res) => {
    const { petitionId } = req.params;

    // Fetch petition with all related data
    const petition = await Petition.findById(petitionId)
        .populate("petitionStarter.user", "name email designation")
        .populate("signatures.user", "name email designation");

    if (!petition) {
        res.status(404);
        throw new Error("Petition not found");
    }

    // Fetch all approved comments for this petition
    const comments = await Comment.find({
        petition: petitionId,
        isApproved: true,
    })
        .populate("user", "name email designation")
        .sort({ createdAt: -1 });

    // Import PDFKit dynamically
    const PDFDocument = (await import("pdfkit")).default;

    // Create PDF document
    const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
            Title: `Petition: ${petition.title}`,
            Author: "SOSIGN Platform - Admin Export",
            Subject: "Petition Data Export",
            CreationDate: new Date(),
        },
    });

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="petition-${petition._id}-admin-export.pdf"`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Helper function for adding sections
    const addSectionHeader = (text) => {
        doc.moveDown(0.5);
        doc.fontSize(14).fillColor("#3650AD").font("Helvetica-Bold").text(text);
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
    doc.rect(0, 0, 612, 100).fill("#3650AD");
    doc.fontSize(24).fillColor("#ffffff").font("Helvetica-Bold").text("SOSIGN", 50, 30);
    doc.fontSize(12).fillColor("#ffffff").font("Helvetica").text("Admin Petition Data Export", 50, 60);
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`, 50, 78);

    doc.moveDown(3);
    doc.y = 120;

    // ===== PETITION TITLE =====
    doc.fontSize(18).fillColor("#1a1a2e").font("Helvetica-Bold").text(petition.title, { align: "center" });
    doc.moveDown(1);

    // ===== PETITION DETAILS =====
    addSectionHeader("PETITION DETAILS");
    addLabelValue("Petition ID", petition._id.toString());
    addLabelValue("Country", petition.country);
    addLabelValue("Categories", petition.categories?.join(", ") || "N/A");
    addLabelValue("Status", petition.approved ? "Approved" : "Pending Approval");
    addLabelValue("Created At", new Date(petition.createdAt).toLocaleDateString());
    addLabelValue("Last Updated", new Date(petition.updatedAt).toLocaleDateString());

    // Problem & Solution
    if (petition.petitionDetails?.problem) {
        addSectionHeader("PROBLEM");
        doc.fontSize(10).font("Helvetica").text(petition.petitionDetails.problem, { align: "justify" });
    }

    if (petition.petitionDetails?.solution) {
        addSectionHeader("SOLUTION");
        doc.fontSize(10).font("Helvetica").text(petition.petitionDetails.solution, { align: "justify" });
    }

    // ===== PETITION STARTER =====
    addSectionHeader("PETITION STARTER");
    addLabelValue("Name", petition.petitionStarter?.name || petition.petitionStarter?.user?.name || "Anonymous");
    addLabelValue("Email", petition.petitionStarter?.user?.email || "N/A");
    addLabelValue("Location", petition.petitionStarter?.location || "N/A");
    if (petition.petitionStarter?.comment) {
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Oblique").text(`"${petition.petitionStarter.comment}"`, { indent: 20 });
    }

    // ===== DECISION MAKERS =====
    if (petition.decisionMakers && petition.decisionMakers.length > 0) {
        addSectionHeader("DECISION MAKERS");
        petition.decisionMakers.forEach((dm, index) => {
            doc.fontSize(10).font("Helvetica").text(`${index + 1}. ${dm.name}${dm.organization ? ` (${dm.organization})` : ""}${dm.email ? ` - ${dm.email}` : ""}`);
        });
    }

    // ===== STATISTICS =====
    addSectionHeader("STATISTICS");
    const totalSignatures = petition.numberOfSignatures || petition.signatures?.length || 0;
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#F43676").text(`Total Signatures: ${totalSignatures}`);
    doc.fillColor("#333333").fontSize(10).font("Helvetica").text(`Total Comments: ${comments.length}`);

    // ===== SIGNATURES LIST =====
    if (petition.signatures && petition.signatures.length > 0) {
        if (doc.y > 650) {
            doc.addPage();
        } else {
            doc.moveDown(1);
        }
        addSectionHeader(`SIGNATURES (${petition.signatures.length} total)`);

        // Table header
        const tableTop = doc.y;
        const tableLeft = 50;
        doc.fontSize(9).font("Helvetica-Bold");
        doc.text("#", tableLeft, tableTop, { width: 30 });
        doc.text("Name", tableLeft + 30, tableTop, { width: 150 });
        doc.text("Email", tableLeft + 180, tableTop, { width: 180 });
        doc.text("Signed At", tableLeft + 360, tableTop, { width: 100 });
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e0e0e0").stroke();
        doc.moveDown(0.3);

        // Table rows
        doc.font("Helvetica").fontSize(8);
        petition.signatures.slice(0, 100).forEach((sig, index) => {
            if (doc.y > 750) {
                doc.addPage();
                doc.y = 50;
            }
            const rowY = doc.y;
            doc.text(`${index + 1}`, tableLeft, rowY, { width: 30 });
            doc.text(sig.user?.name || "Anonymous", tableLeft + 30, rowY, { width: 150 });
            doc.text(sig.user?.email || "N/A", tableLeft + 180, rowY, { width: 180 });
            doc.text(sig.signedAt ? new Date(sig.signedAt).toLocaleDateString() : "N/A", tableLeft + 360, rowY, { width: 100 });
            doc.moveDown(0.5);
        });

        if (petition.signatures.length > 100) {
            doc.moveDown(0.5);
            doc.fontSize(9).font("Helvetica-Oblique").text(`... and ${petition.signatures.length - 100} more signatures`);
        }
    }

    // ===== COMMENTS =====
    if (comments.length > 0) {
        if (doc.y > 650) {
            doc.addPage();
        } else {
            doc.moveDown(1);
        }
        addSectionHeader(`COMMENTS (${comments.length} total)`);

        comments.slice(0, 50).forEach((comment, index) => {
            if (doc.y > 700) {
                doc.addPage();
                doc.y = 50;
            }
            doc.fontSize(9).font("Helvetica-Bold").text(`${index + 1}. ${comment.user?.name || "Anonymous"}`, { continued: true });
            doc.font("Helvetica").fontSize(8).fillColor("#666666").text(` - ${new Date(comment.createdAt).toLocaleDateString()}`);
            doc.fillColor("#333333").fontSize(9).font("Helvetica").text(comment.content, { indent: 15 });
            doc.moveDown(0.5);
        });

        if (comments.length > 50) {
            doc.fontSize(9).font("Helvetica-Oblique").text(`... and ${comments.length - 50} more comments`);
        }
    }

    // ===== FOOTER =====
    doc.moveDown(1.5);
    doc.fontSize(8).fillColor("#999999").font("Helvetica").text(
        `This document was exported by Admin (${req.admin?.username || "admin"}) on ${new Date().toISOString()}`,
        { align: "center" }
    );

    // Finalize PDF
    doc.end();
});

export {
    createDownloadRequest,
    getUserDownloadRequests,
    checkDownloadRequestStatus,
    downloadPetitionData,
    getAllDownloadRequests,
    getPendingRequestsCount,
    approveDownloadRequest,
    rejectDownloadRequest,
    adminDownloadPetitionData,
};
