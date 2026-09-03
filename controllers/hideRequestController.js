import asyncHandler from "express-async-handler";
import HideRequest from "../models/hideRequestModel.js";
import Petition from "../models/petitionModel.js";
import createAdminNotification from "../utils/adminNotifier.js";

// @desc    Create a hide request for a petition
// @route   POST /api/hide-requests
// @access  Private (User)
const createHideRequest = asyncHandler(async (req, res) => {
    const { petitionId, reason } = req.body;

    if (!petitionId) {
        res.status(400);
        throw new Error("Petition ID is required");
    }

    // Check if petition exists
    const petition = await Petition.findById(petitionId);
    if (!petition) {
        res.status(404);
        throw new Error("Petition not found");
    }

    // Check if user is the petition owner
    if (petition.petitionStarter.user.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error("Not authorized - you can only request to hide your own petitions");
    }

    // Check if petition is already hidden
    if (petition.hidden) {
        res.status(400);
        throw new Error("This petition is already hidden");
    }

    // Check if there's already a pending request for this petition
    const existingRequest = await HideRequest.findOne({
        petition: petitionId,
        status: "pending",
    });

    if (existingRequest) {
        res.status(400);
        throw new Error("A hide request for this petition is already pending");
    }

    // Create the hide request
    const hideRequest = await HideRequest.create({
        petition: petitionId,
        user: req.user._id,
        reason: reason || "",
    });

    // Trigger Admin Notification
    createAdminNotification({
        category: "hide_request",
        title: "New Petition Hide Request",
        message: `${req.user?.name || "Creator"} requested to hide petition "${petition.title}"`,
        link: "/dashboard/hide-requests",
        relatedId: hideRequest._id,
        meta: {
            petitionTitle: petition.title,
            creatorName: req.user?.name,
            reason: reason || "",
        },
    });

    res.status(201).json({
        success: true,
        message: "Hide request submitted successfully. Awaiting admin approval.",
        hideRequest,
    });
});

// @desc    Get all hide requests (for admin)
// @route   GET /api/hide-requests
// @access  Private (Admin)
const getHideRequests = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status; // Optional filter by status

    let query = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
        query.status = status;
    }

    const hideRequests = await HideRequest.find(query)
        .populate("petition", "title petitionDetails.image numberOfSignatures")
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const total = await HideRequest.countDocuments(query);

    res.status(200).json({
        success: true,
        hideRequests,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalResults: total,
        },
    });
});

// @desc    Check if user has a hide request for a petition
// @route   GET /api/hide-requests/check/:petitionId
// @access  Private (User)
const checkHideRequestStatus = asyncHandler(async (req, res) => {
    const { petitionId } = req.params;

    const hideRequest = await HideRequest.findOne({
        petition: petitionId,
        user: req.user._id,
    }).sort({ createdAt: -1 });

    if (hideRequest) {
        res.status(200).json({
            hasRequest: true,
            status: hideRequest.status,
            reason: hideRequest.reason,
            adminNote: hideRequest.adminNote,
            createdAt: hideRequest.createdAt,
            reviewedAt: hideRequest.reviewedAt,
        });
    } else {
        res.status(200).json({
            hasRequest: false,
        });
    }
});

// @desc    Approve a hide request
// @route   PUT /api/hide-requests/:id/approve
// @access  Private (Admin)
const approveHideRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const hideRequest = await HideRequest.findById(id);

    if (!hideRequest) {
        res.status(404);
        throw new Error("Hide request not found");
    }

    if (hideRequest.status !== "pending") {
        res.status(400);
        throw new Error("This request has already been processed");
    }

    // Update the petition to hidden
    const petition = await Petition.findById(hideRequest.petition);
    if (!petition) {
        res.status(404);
        throw new Error("Associated petition not found");
    }

    petition.hidden = true;
    petition.hiddenAt = new Date();
    await petition.save();

    // Update the hide request
    hideRequest.status = "approved";
    hideRequest.adminNote = adminNote || "";
    hideRequest.reviewedBy = req.admin?.username || "admin";
    hideRequest.reviewedAt = new Date();
    await hideRequest.save();

    res.status(200).json({
        success: true,
        message: "Hide request approved. Petition is now hidden from public view.",
        hideRequest,
    });
});

// @desc    Reject a hide request
// @route   PUT /api/hide-requests/:id/reject
// @access  Private (Admin)
const rejectHideRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { adminNote } = req.body;

    const hideRequest = await HideRequest.findById(id);

    if (!hideRequest) {
        res.status(404);
        throw new Error("Hide request not found");
    }

    if (hideRequest.status !== "pending") {
        res.status(400);
        throw new Error("This request has already been processed");
    }

    // Update the hide request
    hideRequest.status = "rejected";
    hideRequest.adminNote = adminNote || "";
    hideRequest.reviewedBy = req.admin?.username || "admin";
    hideRequest.reviewedAt = new Date();
    await hideRequest.save();

    res.status(200).json({
        success: true,
        message: "Hide request rejected.",
        hideRequest,
    });
});

// @desc    Get hide request stats for admin dashboard
// @route   GET /api/hide-requests/stats
// @access  Private (Admin)
const getHideRequestStats = asyncHandler(async (req, res) => {
    const pendingCount = await HideRequest.countDocuments({ status: "pending" });
    const approvedCount = await HideRequest.countDocuments({ status: "approved" });
    const rejectedCount = await HideRequest.countDocuments({ status: "rejected" });
    const totalCount = pendingCount + approvedCount + rejectedCount;

    res.status(200).json({
        success: true,
        stats: {
            pending: pendingCount,
            approved: approvedCount,
            rejected: rejectedCount,
            total: totalCount,
        },
    });
});

export {
    createHideRequest,
    getHideRequests,
    checkHideRequestStatus,
    approveHideRequest,
    rejectHideRequest,
    getHideRequestStats,
};
