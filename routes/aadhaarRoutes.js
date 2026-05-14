import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  sendAadhaarOtp,
  verifyAadhaarOtp,
  verifyAadhaarKyc,
  initializeDigilocker,
  getDigilockerStatus,
  completeDigilockerKyc,
} from "../controllers/aadhaarController.js";
import aadhaarKycUpload from "../middleware/aadhaarKycUpload.js";

const router = express.Router();

router.post("/send-otp", protect, sendAadhaarOtp);
router.post("/verify-otp", protect, verifyAadhaarOtp);
router.post(
  "/verify-kyc",
  protect,
  aadhaarKycUpload.fields([
    { name: "FrontImage", maxCount: 1 },
    { name: "BackImage", maxCount: 1 },
  ]),
  verifyAadhaarKyc,
);

// DigiLocker routes
router.post("/digilocker/initialize", protect, initializeDigilocker);
router.post("/digilocker/status", protect, getDigilockerStatus);
router.post("/digilocker/complete", protect, completeDigilockerKyc);

export default router;
