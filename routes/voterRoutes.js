import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { verifyVoterCard } from "../controllers/voterController.js";

const router = express.Router();

router.post("/verify", protect, verifyVoterCard);

export default router;
