import express from "express";
import { submitPetitionReport } from "../controllers/petitionReportController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// User submits petition objection report (Requires login & Aadhaar KYC)
router.post("/petition", protect, submitPetitionReport);

export default router;
