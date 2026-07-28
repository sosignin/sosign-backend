import Newsletter from "../models/newsletterModel.js";
import NewsletterSubscriber from "../models/newsletterSubscriberModel.js";
import asyncHandler from "express-async-handler";

// @desc    Get published newsletters for frontend public page
// @route   GET /api/newsletters
// @access  Public
const getNewsletters = asyncHandler(async (req, res) => {
  const { page = 1, limit = 9, category, featured, search } = req.query;

  const query = { isPublished: true };

  if (category && category !== "All") {
    query.category = category;
  }

  if (featured === "true") {
    query.isFeatured = true;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { content: { $regex: search, $options: "i" } },
      { excerpt: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const newsletters = await Newsletter.find(query)
    .sort({ isFeatured: -1, issueNumber: -1, createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Newsletter.countDocuments(query);

  // Get list of distinct categories for filters
  const categories = await Newsletter.distinct("category", { isPublished: true });

  res.json({
    newsletters,
    categories: ["All", ...categories.filter(Boolean)],
    totalPages: Math.ceil(total / parseInt(limit)),
    currentPage: parseInt(page),
    totalNewsletters: total,
    hasNextPage: skip + newsletters.length < total,
    hasPrevPage: parseInt(page) > 1,
  });
});

// @desc    Get single newsletter by slug
// @route   GET /api/newsletters/:slug
// @access  Public
const getNewsletterBySlug = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findOne({
    slug: req.params.slug,
    isPublished: true,
  });

  if (!newsletter) {
    res.status(404);
    throw new Error("Newsletter issue not found");
  }

  // Increment views counter
  newsletter.views += 1;
  await newsletter.save();

  // Fetch 3 related newsletter issues
  const related = await Newsletter.find({
    _id: { $ne: newsletter._id },
    isPublished: true,
  })
    .sort({ createdAt: -1 })
    .limit(3);

  res.json({
    newsletter,
    related,
  });
});

// @desc    Subscribe email to newsletter
// @route   POST /api/newsletters/subscribe
// @access  Public
const subscribe = asyncHandler(async (req, res) => {
  const { email, name, source } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Email address is required");
  }

  const existing = await NewsletterSubscriber.findOne({ email: email.toLowerCase().trim() });

  if (existing) {
    if (existing.status === "active") {
      return res.status(200).json({
        message: "You are already subscribed to our newsletter!",
        subscriber: existing,
      });
    } else {
      existing.status = "active";
      existing.subscribedAt = new Date();
      if (name) existing.name = name;
      await existing.save();

      return res.status(200).json({
        message: "Welcome back! Your newsletter subscription has been reactivated.",
        subscriber: existing,
      });
    }
  }

  const subscriber = await NewsletterSubscriber.create({
    email: email.toLowerCase().trim(),
    name: name || "",
    source: source || "website_newsletter",
  });

  res.status(201).json({
    message: "Thank you for subscribing to the Sosign Newsletter!",
    subscriber,
  });
});

// @desc    Unsubscribe email
// @route   POST /api/newsletters/unsubscribe
// @access  Public
const unsubscribe = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Email address is required");
  }

  const subscriber = await NewsletterSubscriber.findOne({ email: email.toLowerCase().trim() });

  if (!subscriber) {
    res.status(404);
    throw new Error("Email not found in our subscriber list");
  }

  subscriber.status = "unsubscribed";
  subscriber.unsubscribedAt = new Date();
  await subscriber.save();

  res.json({ message: "You have been unsubscribed successfully." });
});

// ================= ADMIN CONTROLLER METHODS ================= //

// @desc    Get all newsletters (admin including unpublished)
// @route   GET /api/newsletters/admin/all
// @access  Private/Admin
const getAllNewslettersAdmin = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const newsletters = await Newsletter.find({})
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Newsletter.countDocuments({});
  const publishedCount = await Newsletter.countDocuments({ isPublished: true });
  const draftCount = await Newsletter.countDocuments({ isPublished: false });
  const totalSubscribers = await NewsletterSubscriber.countDocuments({ status: "active" });

  res.json({
    newsletters,
    stats: {
      total,
      publishedCount,
      draftCount,
      totalSubscribers,
    },
    totalPages: Math.ceil(total / parseInt(limit)),
    currentPage: parseInt(page),
  });
});

// @desc    Get newsletter by ID (admin)
// @route   GET /api/newsletters/admin/:id
// @access  Private/Admin
const getNewsletterByIdAdmin = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findById(req.params.id);

  if (!newsletter) {
    res.status(404);
    throw new Error("Newsletter issue not found");
  }

  res.json(newsletter);
});

// @desc    Create new newsletter issue (admin)
// @route   POST /api/newsletters
// @access  Private/Admin
const createNewsletter = asyncHandler(async (req, res) => {
  const {
    title,
    subject,
    content,
    excerpt,
    author,
    category,
    tags,
    issueNumber,
    metaTitle,
    metaDescription,
    keywords,
    isPublished,
    isFeatured,
    coverImage: imageInputUrl,
  } = req.body;

  if (!title || !content) {
    res.status(400);
    throw new Error("Title and content are required");
  }

  let imageUrl = imageInputUrl || "";
  if (req.file) {
    imageUrl = req.file.path; // Cloudinary URL
  }

  let parsedTags = tags;
  if (typeof tags === "string") {
    try {
      parsedTags = JSON.parse(tags);
    } catch (e) {
      parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }

  let parsedKeywords = keywords;
  if (typeof keywords === "string") {
    try {
      parsedKeywords = JSON.parse(keywords);
    } catch (e) {
      parsedKeywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    }
  }

  // Calculate next issue number if not provided
  let calculatedIssue = Number(issueNumber);
  if (!calculatedIssue || isNaN(calculatedIssue)) {
    const lastIssue = await Newsletter.findOne({}).sort({ issueNumber: -1 });
    calculatedIssue = lastIssue ? (lastIssue.issueNumber || 0) + 1 : 1;
  }

  const newsletter = await Newsletter.create({
    title,
    subject: subject || title,
    content,
    excerpt: excerpt || "",
    author: author || "Sosign Team",
    coverImage: imageUrl,
    category: category || "General",
    tags: parsedTags || [],
    issueNumber: calculatedIssue,
    metaTitle: metaTitle || title,
    metaDescription: metaDescription || excerpt || "",
    keywords: parsedKeywords || [],
    isPublished: isPublished === "true" || isPublished === true,
    isFeatured: isFeatured === "true" || isFeatured === true,
    publishedAt: new Date(),
  });

  res.status(201).json(newsletter);
});

// @desc    Update newsletter issue (admin)
// @route   PUT /api/newsletters/:id
// @access  Private/Admin
const updateNewsletter = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findById(req.params.id);

  if (!newsletter) {
    res.status(404);
    throw new Error("Newsletter issue not found");
  }

  const {
    title,
    subject,
    content,
    excerpt,
    author,
    category,
    tags,
    issueNumber,
    metaTitle,
    metaDescription,
    keywords,
    isPublished,
    isFeatured,
    coverImage: imageInputUrl,
  } = req.body;

  let imageUrl = newsletter.coverImage;
  if (req.file) {
    imageUrl = req.file.path;
  } else if (imageInputUrl !== undefined) {
    imageUrl = imageInputUrl;
  }

  let parsedTags = tags;
  if (typeof tags === "string") {
    try {
      parsedTags = JSON.parse(tags);
    } catch (e) {
      parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }

  let parsedKeywords = keywords;
  if (typeof keywords === "string") {
    try {
      parsedKeywords = JSON.parse(keywords);
    } catch (e) {
      parsedKeywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    }
  }

  newsletter.title = title || newsletter.title;
  newsletter.subject = subject !== undefined ? subject : newsletter.subject;
  newsletter.content = content || newsletter.content;
  newsletter.excerpt = excerpt !== undefined ? excerpt : newsletter.excerpt;
  newsletter.author = author || newsletter.author;
  newsletter.coverImage = imageUrl;
  newsletter.category = category || newsletter.category;
  if (parsedTags) newsletter.tags = parsedTags;
  if (issueNumber) newsletter.issueNumber = Number(issueNumber);
  newsletter.metaTitle = metaTitle !== undefined ? metaTitle : newsletter.metaTitle;
  newsletter.metaDescription = metaDescription !== undefined ? metaDescription : newsletter.metaDescription;
  if (parsedKeywords) newsletter.keywords = parsedKeywords;
  if (isPublished !== undefined) newsletter.isPublished = isPublished === "true" || isPublished === true;
  if (isFeatured !== undefined) newsletter.isFeatured = isFeatured === "true" || isFeatured === true;

  const updated = await newsletter.save();
  res.json(updated);
});

// @desc    Delete newsletter issue (admin)
// @route   DELETE /api/newsletters/:id
// @access  Private/Admin
const deleteNewsletter = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findById(req.params.id);

  if (!newsletter) {
    res.status(404);
    throw new Error("Newsletter issue not found");
  }

  await newsletter.deleteOne();
  res.json({ message: "Newsletter issue removed successfully" });
});

// @desc    Toggle newsletter publish status (admin)
// @route   PATCH /api/newsletters/:id/publish
// @access  Private/Admin
const togglePublished = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findById(req.params.id);

  if (!newsletter) {
    res.status(404);
    throw new Error("Newsletter issue not found");
  }

  newsletter.isPublished = !newsletter.isPublished;
  await newsletter.save();

  res.json({ isPublished: newsletter.isPublished });
});

// @desc    Get subscribers list (admin)
// @route   GET /api/newsletters/admin/subscribers
// @access  Private/Admin
const getSubscribersAdmin = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, search, status } = req.query;

  const query = {};
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: "i" } },
      { name: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const subscribers = await NewsletterSubscriber.find(query)
    .sort({ subscribedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await NewsletterSubscriber.countDocuments(query);
  const activeCount = await NewsletterSubscriber.countDocuments({ status: "active" });

  res.json({
    subscribers,
    totalSubscribers: total,
    activeSubscribers: activeCount,
    totalPages: Math.ceil(total / parseInt(limit)),
    currentPage: parseInt(page),
  });
});

// @desc    Delete subscriber (admin)
// @route   DELETE /api/newsletters/admin/subscribers/:id
// @access  Private/Admin
const deleteSubscriberAdmin = asyncHandler(async (req, res) => {
  const subscriber = await NewsletterSubscriber.findById(req.params.id);

  if (!subscriber) {
    res.status(404);
    throw new Error("Subscriber not found");
  }

  await subscriber.deleteOne();
  res.json({ message: "Subscriber removed successfully" });
});

export {
  getNewsletters,
  getNewsletterBySlug,
  subscribe,
  unsubscribe,
  getAllNewslettersAdmin,
  getNewsletterByIdAdmin,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
  togglePublished,
  getSubscribersAdmin,
  deleteSubscriberAdmin,
};
