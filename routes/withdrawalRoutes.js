import express from "express";
import {
  createWithdrawalRequest,
  getMyWithdrawals,
  getAllWithdrawals,
  updateWithdrawalStatus,
} from "../controllers/withdrawalController.js";
import { protect } from "../middleware/authMiddleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

router.route("/")
  .post(protect, createWithdrawalRequest)
  .get(adminAuth, getAllWithdrawals);

router.get("/my", protect, getMyWithdrawals);

router.route("/:id")
  .put(adminAuth, updateWithdrawalStatus);

export default router;
