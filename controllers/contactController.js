import Contact from "../models/contactModel.js";
import createAdminNotification from "../utils/adminNotifier.js";

// @desc    Submit a contact form message
// @route   POST /api/contact
// @access  Public
export const createContactMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, subject, and message.",
      });
    }

    const contact = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
    });

    // Trigger Admin Notification
    createAdminNotification({
      category: "contact_message",
      title: "New Contact Message 📩",
      message: `${name.trim()} (${email.trim()}): "${subject.trim()}"`,
      link: "/dashboard/contact-messages",
      relatedId: contact._id,
      meta: {
        senderName: name.trim(),
        senderEmail: email.trim(),
        subject: subject.trim(),
      },
    });

    res.status(201).json({
      success: true,
      message: "Thank you! Your message has been sent successfully. Our team will get back to you shortly.",
      contact,
    });
  } catch (error) {
    console.error("Error submitting contact message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again later.",
    });
  }
};

// @desc    Get all contact messages (Admin)
// @route   GET /api/contact/admin/all
// @access  Admin
export const getAllContactMessages = async (req, res) => {
  try {
    const { status, search } = req.query;

    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    const messages = await Contact.find(query).sort({ createdAt: -1 });
    const unreadCount = await Contact.countDocuments({ status: "unread" });
    const totalCount = await Contact.countDocuments();

    res.status(200).json({
      success: true,
      count: messages.length,
      unreadCount,
      totalCount,
      messages,
    });
  } catch (error) {
    console.error("Error fetching contact messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contact messages.",
    });
  }
};

// @desc    Update contact message status (Admin)
// @route   PUT /api/contact/admin/:id/status
// @access  Admin
export const updateContactStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["unread", "read", "replied", "archived"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value.",
      });
    }

    const contact = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact message not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Contact message status updated successfully.",
      contact,
    });
  } catch (error) {
    console.error("Error updating contact status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update status.",
    });
  }
};

// @desc    Delete contact message (Admin)
// @route   DELETE /api/contact/admin/:id
// @access  Admin
export const deleteContactMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findByIdAndDelete(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact message not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Contact message deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting contact message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete contact message.",
    });
  }
};
