import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { verifyPanCard } from "../controllers/panController.js";

const router = express.Router();

router.post("/verify", protect, verifyPanCard);

export default router;
