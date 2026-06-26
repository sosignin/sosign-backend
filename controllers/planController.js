import asyncHandler from "express-async-handler";
import Plan from "../models/planModel.js";

// @desc    Get active plans
// @route   GET /api/plans
// @access  Public
export const getPlans = asyncHandler(async (req, res) => {
    const plans = await Plan.find({ isActive: true }).sort({ price: 1 });
    res.status(200).json(plans);
});

// @desc    Admin: Get all plans
// @route   GET /api/admin/plans
// @access  Private/Admin
export const adminGetPlans = asyncHandler(async (req, res) => {
    const plans = await Plan.find({}).sort({ price: 1 });
    res.status(200).json(plans);
});

// @desc    Admin: Create new plan
// @route   POST /api/admin/plans
// @access  Private/Admin
export const adminCreatePlan = asyncHandler(async (req, res) => {
    const { key, name, price, mrpPrice, points, bestFor, deductions, isActive } = req.body;

    if (!key || !name || price === undefined || points === undefined || !deductions) {
        res.status(400);
        throw new Error("Please provide all required fields");
    }

    const keyExists = await Plan.findOne({ key: key.toLowerCase().trim() });
    if (keyExists) {
        res.status(400);
        throw new Error(`Plan with key '${key}' already exists`);
    }

    const plan = await Plan.create({
        key: key.toLowerCase().trim(),
        name,
        price,
        mrpPrice: mrpPrice !== undefined ? mrpPrice : price,
        points,
        bestFor,
        isCustom: req.body.isCustom !== undefined ? req.body.isCustom : false,
        deductions,
        isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({
        success: true,
        message: "Plan created successfully",
        plan,
    });
});

// @desc    Admin: Update existing plan
// @route   PUT /api/admin/plans/:id
// @access  Private/Admin
export const adminUpdatePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, price, mrpPrice, points, bestFor, deductions, isActive } = req.body;

    const plan = await Plan.findById(id);
    if (!plan) {
        res.status(404);
        throw new Error("Plan not found");
    }

    if (name !== undefined) plan.name = name;
    if (price !== undefined) plan.price = price;
    if (mrpPrice !== undefined) plan.mrpPrice = mrpPrice;
    if (points !== undefined) plan.points = points;
    if (bestFor !== undefined) plan.bestFor = bestFor;
    if (req.body.isCustom !== undefined) plan.isCustom = req.body.isCustom;
    if (deductions !== undefined) {
        plan.deductions = {
            aadhaar: deductions.aadhaar !== undefined ? deductions.aadhaar : plan.deductions.aadhaar,
            pan: deductions.pan !== undefined ? deductions.pan : plan.deductions.pan,
            voter: deductions.voter !== undefined ? deductions.voter : plan.deductions.voter,
            aadhaar_pan: deductions.aadhaar_pan !== undefined ? deductions.aadhaar_pan : plan.deductions.aadhaar_pan,
            aadhaar_voter: deductions.aadhaar_voter !== undefined ? deductions.aadhaar_voter : plan.deductions.aadhaar_voter,
            sms_dm: deductions.sms_dm !== undefined ? deductions.sms_dm : plan.deductions.sms_dm,
            email_dm: deductions.email_dm !== undefined ? deductions.email_dm : plan.deductions.email_dm,
            whatsapp_dm: deductions.whatsapp_dm !== undefined ? deductions.whatsapp_dm : plan.deductions.whatsapp_dm,
        };
    }
    if (isActive !== undefined) plan.isActive = isActive;

    await plan.save();

    res.status(200).json({
        success: true,
        message: "Plan updated successfully",
        plan,
    });
});

// @desc    Admin: Delete plan
// @route   DELETE /api/admin/plans/:id
// @access  Private/Admin
export const adminDeletePlan = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const plan = await Plan.findById(id);
    if (!plan) {
        res.status(404);
        throw new Error("Plan not found");
    }

    if (plan.key === "free") {
        res.status(400);
        throw new Error("Cannot delete the default free plan tier");
    }

    await Plan.findByIdAndDelete(id);

    res.status(200).json({
        success: true,
        message: "Plan deleted successfully",
    });
});
