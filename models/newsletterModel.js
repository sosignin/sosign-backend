import mongoose from "mongoose";

const newsletterSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxLength: [200, "Title cannot exceed 200 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    subject: {
      type: String,
      trim: true,
      maxLength: [200, "Subject cannot exceed 200 characters"],
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
      default: "Sosign Team",
      trim: true,
    },
    coverImage: {
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
    issueNumber: {
      type: Number,
      default: 1,
    },
    metaTitle: {
      type: String,
      trim: true,
      maxLength: [150, "Meta title cannot exceed 150 characters"],
    },
    metaDescription: {
      type: String,
      trim: true,
      maxLength: [300, "Meta description cannot exceed 300 characters"],
    },
    keywords: [
      {
        type: String,
        trim: true,
      },
    ],
    isPublished: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
    views: {
      type: Number,
      default: 0,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save slug generation & auto excerpt
newsletterSchema.pre("save", function (next) {
  if (this.isModified("title") || !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  // Auto-generate excerpt if empty
  if (!this.excerpt && this.content) {
    // Strip HTML tags for clean excerpt if content has HTML
    const cleanText = this.content.replace(/<[^>]*>?/gm, "");
    this.excerpt = cleanText.substring(0, 200) + (cleanText.length > 200 ? "..." : "");
  }

  // Auto-set meta title & description if empty
  if (!this.metaTitle) {
    this.metaTitle = this.title;
  }
  if (!this.metaDescription && this.excerpt) {
    this.metaDescription = this.excerpt.substring(0, 160);
  }

  next();
});

// Ensure slug uniqueness
newsletterSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("slug")) {
    const existing = await this.constructor.findOne({
      slug: this.slug,
      _id: { $ne: this._id },
    });
    if (existing) {
      this.slug = `${this.slug}-${Date.now().toString(36)}`;
    }
  }
  next();
});

// Indexes for fast querying & search
newsletterSchema.index({ title: "text", content: "text", category: "text" });
newsletterSchema.index({ createdAt: -1 });
newsletterSchema.index({ isPublished: 1, createdAt: -1 });
newsletterSchema.index({ slug: 1 });

const Newsletter = mongoose.model("Newsletter", newsletterSchema);

export default Newsletter;
