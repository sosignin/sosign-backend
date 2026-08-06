import express from "express";
import {
    createDownloadRequest,
    getUserDownloadRequests,
    checkDownloadRequestStatus,
    downloadPetitionData,
    getAllDownloadRequests,
    getPendingRequestsCount,
    approveDownloadRequest,
    rejectDownloadRequest,
    adminDownloadPetitionData,
} from "../controllers/downloadRequestController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// User routes (protected)
router.route("/").post(protect, createDownloadRequest);
router.route("/my-requests").get(protect, getUserDownloadRequests);
router.route("/check/:petitionId").get(protect, checkDownloadRequestStatus);
router.route("/download/:petitionId").get(protect, downloadPetitionData);

// Admin routes
router.route("/admin/all").get(adminAuth, getAllDownloadRequests);
router.route("/admin/pending-count").get(adminAuth, getPendingRequestsCount);
router.route("/admin/download/:petitionId").get(adminAuth, adminDownloadPetitionData);
router.route("/admin/:id/approve").put(adminAuth, approveDownloadRequest).post(adminAuth, approveDownloadRequest);
router.route("/admin/:id/reject").put(adminAuth, rejectDownloadRequest).post(adminAuth, rejectDownloadRequest);

export default router;
