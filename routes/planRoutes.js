import express from "express";
import { getPlans } from "../controllers/planController.js";

const router = express.Router();

router.get("/", getPlans);
router.get("/debug-db", async (req, res) => {
    try {
        const mongoose = await import("mongoose");
        const Plan = mongoose.default.model("Plan");
        const plans = await Plan.find({});
        res.json({
            databaseName: mongoose.default.connection.name,
            host: mongoose.default.connection.host,
            plansCount: plans.length,
            plans
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
