import asyncHandler from "express-async-handler";
import Category from "../models/categoryModel.js";

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find({})
        .sort({ isDefault: -1, name: 1 }) // Default categories first, then alphabetical
        .lean();

    res.status(200).json({
        success: true,
        categories,
        total: categories.length,
    });
});

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private (requires authentication)
const createCategory = asyncHandler(async (req, res) => {
    const { name, icon } = req.body;

    if (!name || name.trim().length === 0) {
        res.status(400);
        throw new Error("Category name is required");
    }

    if (name.trim().length > 15) {
        res.status(400);
        throw new Error("Category name can be up to 15 characters only");
    }

    // Check if category already exists (case-insensitive)
    const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });

    if (existingCategory) {
        res.status(400);
        throw new Error("A category with this name already exists");
    }

    // Check if user has already created 2 categories
    const userId = req.user?._id;
    if (userId) {
        const createdCount = await Category.countDocuments({ createdBy: userId });
        if (createdCount >= 2) {
            res.status(400);
            throw new Error("Category creation limit reached. You can only create up to 2 custom categories.");
        }
    }

    const category = await Category.create({
        name: name.trim(),
        icon: icon || null,
        isDefault: false,
        createdBy: userId || null,
    });

    res.status(201).json({
        success: true,
        message: "Category created successfully",
        category: {
            _id: category._id,
            name: category.name,
            slug: category.slug,
            icon: category.icon,
            isDefault: category.isDefault,
            createdAt: category.createdAt,
        },
    });
});

// @desc    Get category by slug
// @route   GET /api/categories/:slug
// @access  Public
const getCategoryBySlug = asyncHandler(async (req, res) => {
    const category = await Category.findOne({ slug: req.params.slug }).lean();

    if (!category) {
        res.status(404);
        throw new Error("Category not found");
    }

    res.status(200).json({
        success: true,
        category,
    });
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private (requires admin)
const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);

    if (!category) {
        res.status(404);
        throw new Error("Category not found");
    }

    // Optional: Prevent deleting default categories if needed
    // if (category.isDefault) {
    //     res.status(400);
    //     throw new Error("Default categories cannot be deleted");
    // }

    await Category.findByIdAndDelete(req.params.id);

    res.status(200).json({
        success: true,
        message: "Category deleted successfully",
    });
});

export { getCategories, createCategory, getCategoryBySlug, deleteCategory };
