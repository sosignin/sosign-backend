import Blog from "../models/blogModel.js";
import asyncHandler from "express-async-handler";

// @desc    Get all published blogs
// @route   GET /api/blogs
// @access  Public
const getBlogs = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, category, featured, search } = req.query;

    const query = { isPublished: true };

    if (category) {
        query.category = category;
    }

    if (featured === "true") {
        query.isFeatured = true;
    }

    if (search) {
        query.$or = [
            { title: { $regex: search, $options: "i" } },
            { content: { $regex: search, $options: "i" } },
            { author: { $regex: search, $options: "i" } },
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const blogs = await Blog.find(query)
        .sort({ isFeatured: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Blog.countDocuments(query);

    res.json({
        blogs,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        totalBlogs: total,
        hasNextPage: skip + blogs.length < total,
        hasPrevPage: parseInt(page) > 1,
    });
});

// @desc    Get all blogs (admin - includes unpublished)
// @route   GET /api/blogs/admin/all
// @access  Private/Admin
const getAllBlogsAdmin = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const blogs = await Blog.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

    const total = await Blog.countDocuments({});

    res.json({
        blogs,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        totalBlogs: total,
    });
});

// @desc    Get single blog by slug
// @route   GET /api/blogs/:slug
// @access  Public
const getBlogBySlug = asyncHandler(async (req, res) => {
    const blog = await Blog.findOne({
        slug: req.params.slug,
        isPublished: true,
    });

    if (!blog) {
        res.status(404);
        throw new Error("Blog not found");
    }

    // Increment views
    blog.views += 1;
    await blog.save();

    res.json(blog);
});

// @desc    Get single blog by ID (admin)
// @route   GET /api/blogs/admin/:id
// @access  Private/Admin
const getBlogById = asyncHandler(async (req, res) => {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
        res.status(404);
        throw new Error("Blog not found");
    }

    res.json(blog);
});

// @desc    Create a blog
// @route   POST /api/blogs
// @access  Private/Admin
const createBlog = asyncHandler(async (req, res) => {
    const { title, titleFont, slug, content, excerpt, author, category, tags, isFeatured, isPublished } = req.body;

    if (!title || !content || !author) {
        res.status(400);
        throw new Error("Title, content, and author are required");
    }

    // Handle image from file upload (Cloudinary)
    let imageUrl = "";
    if (req.file) {
        imageUrl = req.file.path; // Cloudinary URL from multer-storage-cloudinary
    }

    // Parse tags if it's a string
    let parsedTags = tags;
    if (typeof tags === "string") {
        try {
            parsedTags = JSON.parse(tags);
        } catch (e) {
            parsedTags = tags.split(",").map(t => t.trim()).filter(t => t);
        }
    }

    // Clean custom slug if provided
    let customSlug = slug ? slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : undefined;

    const blog = await Blog.create({
        title,
        titleFont: titleFont || "'Outfit', sans-serif",
        slug: customSlug,
        content,
        excerpt: excerpt || "",
        author,
        image: imageUrl,
        category: category || "General",
        tags: parsedTags || [],
        isFeatured: isFeatured === "true" || isFeatured === true,
        isPublished: isPublished !== "false" && isPublished !== false,
    });

    res.status(201).json(blog);
});

// @desc    Update a blog
// @route   PUT /api/blogs/:id
// @access  Private/Admin
const updateBlog = asyncHandler(async (req, res) => {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
        res.status(404);
        throw new Error("Blog not found");
    }

    const { title, titleFont, slug, content, excerpt, author, category, tags, isFeatured, isPublished } = req.body;

    // Handle image from file upload (Cloudinary)
    let imageUrl = blog.image;
    if (req.file) {
        imageUrl = req.file.path; // Cloudinary URL from multer-storage-cloudinary
    }

    // Parse tags if it's a string
    let parsedTags = tags;
    if (typeof tags === "string") {
        try {
            parsedTags = JSON.parse(tags);
        } catch (e) {
            parsedTags = tags.split(",").map(t => t.trim()).filter(t => t);
        }
    }

    blog.title = title || blog.title;
    if (titleFont) blog.titleFont = titleFont;
    if (slug) {
        blog.slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    } else if (title && title !== blog.title) {
        blog.slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    }
    blog.content = content || blog.content;
    blog.excerpt = excerpt !== undefined ? excerpt : blog.excerpt;
    blog.author = author || blog.author;
    blog.image = imageUrl;
    blog.category = category || blog.category;
    blog.tags = parsedTags || blog.tags;
    blog.isFeatured = isFeatured !== undefined ? (isFeatured === "true" || isFeatured === true) : blog.isFeatured;
    blog.isPublished = isPublished !== undefined ? (isPublished !== "false" && isPublished !== false) : blog.isPublished;

    const updatedBlog = await blog.save();
    res.json(updatedBlog);
});

// @desc    Delete a blog
// @route   DELETE /api/blogs/:id
// @access  Private/Admin
const deleteBlog = asyncHandler(async (req, res) => {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
        res.status(404);
        throw new Error("Blog not found");
    }

    await blog.deleteOne();
    res.json({ message: "Blog removed successfully" });
});

// @desc    Toggle blog featured status
// @route   PATCH /api/blogs/:id/featured
// @access  Private/Admin
const toggleFeatured = asyncHandler(async (req, res) => {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
        res.status(404);
        throw new Error("Blog not found");
    }

    blog.isFeatured = !blog.isFeatured;
    await blog.save();

    res.json({ isFeatured: blog.isFeatured });
});

// @desc    Toggle blog published status
// @route   PATCH /api/blogs/:id/publish
// @access  Private/Admin
const togglePublished = asyncHandler(async (req, res) => {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
        res.status(404);
        throw new Error("Blog not found");
    }

    blog.isPublished = !blog.isPublished;
    await blog.save();

    res.json({ isPublished: blog.isPublished });
});

export {
    getBlogs,
    getAllBlogsAdmin,
    getBlogBySlug,
    getBlogById,
    createBlog,
    updateBlog,
    deleteBlog,
    toggleFeatured,
    togglePublished,
};
