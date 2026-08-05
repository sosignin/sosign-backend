import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Title is required"],
            trim: true,
            maxLength: [200, "Title cannot exceed 200 characters"],
        },
        titleFont: {
            type: String,
            default: "'Outfit', sans-serif",
        },
        slug: {
            type: String,
            unique: true,
            lowercase: true,
        },
        content: {
            type: String,
            required: [true, "Content is required"],
        },
        excerpt: {
            type: String,
            maxLength: [500, "Excerpt cannot exceed 500 characters"],
        },
        author: {
            type: String,
            required: [true, "Author is required"],
            trim: true,
        },
        image: {
            type: String,
            default: "",
        },
        category: {
            type: String,
            default: "General",
            trim: true,
        },
        tags: [
            {
                type: String,
                trim: true,
            },
        ],
        isFeatured: {
            type: Boolean,
            default: false,
        },
        isPublished: {
            type: Boolean,
            default: true,
        },
        views: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

// Generate or format slug before saving
blogSchema.pre("save", function (next) {
    if (this.slug) {
        this.slug = this.slug
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    } else if (this.title) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    }

    // Auto-generate excerpt if not provided
    if (!this.excerpt && this.content) {
        this.excerpt = this.content.substring(0, 200) + (this.content.length > 200 ? "..." : "");
    }

    next();
});

// Ensure slug uniqueness by adding timestamp suffix
blogSchema.pre("save", async function (next) {
    if (this.isNew) {
        const existingBlog = await this.constructor.findOne({ slug: this.slug });
        if (existingBlog) {
            this.slug = `${this.slug}-${Date.now().toString(36)}`;
        }
    }
    next();
});

// Index for search and sorting
blogSchema.index({ title: "text", content: "text", author: "text" });
blogSchema.index({ createdAt: -1 });
blogSchema.index({ isPublished: 1, isFeatured: 1 });

const Blog = mongoose.model("Blog", blogSchema);

export default Blog;
