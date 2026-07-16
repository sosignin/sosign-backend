import Faq from "../models/faqModel.js";

// @desc    Get all FAQs
// @route   GET /api/faqs
// @access  Public
export const getFaqs = async (req, res) => {
  try {
    const faqs = await Faq.find().sort({ order: 1, createdAt: -1 });
    res.status(200).json({ success: true, count: faqs.length, faqs });
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({ success: false, message: "Server Error fetching FAQs" });
  }
};

// @desc    Get single FAQ by ID
// @route   GET /api/faqs/:id
// @access  Admin/Public
export const getFaqById = async (req, res) => {
  try {
    const faq = await Faq.findById(req.params.id);
    if (!faq) {
      return res.status(404).json({ success: false, message: "FAQ not found" });
    }
    res.status(200).json({ success: true, faq });
  } catch (error) {
    console.error("Error fetching FAQ by ID:", error);
    res.status(500).json({ success: false, message: "Server Error fetching FAQ" });
  }
};

// @desc    Create a new FAQ
// @route   POST /api/faqs
// @access  Private/Admin
export const createFaq = async (req, res) => {
  try {
    const { question, answer, category, order } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ success: false, message: "Question and Answer are required" });
    }

    const faq = await Faq.create({
      question,
      answer,
      category: category || "general",
      order: order || 0,
    });

    res.status(201).json({ success: true, message: "FAQ created successfully", faq });
  } catch (error) {
    console.error("Error creating FAQ:", error);
    res.status(500).json({ success: false, message: "Server Error creating FAQ" });
  }
};

// @desc    Update an FAQ
// @route   PUT /api/faqs/:id
// @access  Private/Admin
export const updateFaq = async (req, res) => {
  try {
    const { question, answer, category, order } = req.body;

    let faq = await Faq.findById(req.params.id);
    if (!faq) {
      return res.status(404).json({ success: false, message: "FAQ not found" });
    }

    faq = await Faq.findByIdAndUpdate(
      req.params.id,
      {
        question: question !== undefined ? question : faq.question,
        answer: answer !== undefined ? answer : faq.answer,
        category: category !== undefined ? category : faq.category,
        order: order !== undefined ? order : faq.order,
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, message: "FAQ updated successfully", faq });
  } catch (error) {
    console.error("Error updating FAQ:", error);
    res.status(500).json({ success: false, message: "Server Error updating FAQ" });
  }
};

// @desc    Delete an FAQ
// @route   DELETE /api/faqs/:id
// @access  Private/Admin
export const deleteFaq = async (req, res) => {
  try {
    const faq = await Faq.findById(req.params.id);
    if (!faq) {
      return res.status(404).json({ success: false, message: "FAQ not found" });
    }

    await Faq.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "FAQ deleted successfully" });
  } catch (error) {
    console.error("Error deleting FAQ:", error);
    res.status(500).json({ success: false, message: "Server Error deleting FAQ" });
  }
};
