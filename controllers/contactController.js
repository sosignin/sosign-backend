import Contact from "../models/contactModel.js";
import createAdminNotification from "../utils/adminNotifier.js";

// @desc    Submit a contact form message
// @route   POST /api/contact
// @access  Public
export const createContactMessage = async (req, res) => {
  try {
    const { name, email, subject, message, category = "general" } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, subject, and message.",
      });
    }

    const isPrivacyRelated =
      category.startsWith("privacy") ||
      category === "data_access" ||
      category === "data_erasure" ||
      category === "data_correction" ||
      category === "consent_withdrawal";

    const prefix = isPrivacyRelated ? "DPDP" : "TKT";
    const ticketId = `${prefix}-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const contact = await Contact.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
      category: category || "general",
      ticketId,
    });

    // Trigger Admin Notification
    createAdminNotification({
      category: isPrivacyRelated ? "privacy_grievance" : "contact_message",
      title: isPrivacyRelated
        ? `🚨 DPDP Statutory Grievance [${ticketId}]`
        : `New Contact Message [${ticketId}] 📩`,
      message: `${name.trim()} (${email.trim()}) - ${category.toUpperCase()}: "${subject.trim()}"`,
      link: "/dashboard/contact-messages",
      relatedId: contact._id,
      meta: {
        senderName: name.trim(),
        senderEmail: email.trim(),
        subject: subject.trim(),
        category,
        ticketId,
      },
    });

    res.status(201).json({
      success: true,
      ticketId,
      message: isPrivacyRelated
        ? `Your DPDP statutory privacy grievance/request has been registered under Ticket #${ticketId}. Under the DPDP Act 2023, our Grievance Redressal Officer will review and respond within statutory timelines.`
        : `Thank you! Your message has been sent successfully under Ticket #${ticketId}. Our team will get back to you shortly.`,
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
    const { status, adminResponse } = req.body;

    const allowedStatuses = ["unread", "read", "replied", "archived", "resolved"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value.",
      });
    }

    const updateFields = { status };
    if (adminResponse !== undefined) {
      updateFields.adminResponse = adminResponse;
    }
    if (status === "resolved") {
      updateFields.resolvedAt = new Date();
    }

    const contact = await Contact.findByIdAndUpdate(
      id,
      updateFields,
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

// @desc    Track contact / DPDP grievance status by Ticket ID
// @route   GET /api/contact/track/:ticketId
// @access  Public
export const getContactByTicketId = async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID is required.",
      });
    }

    const cleanId = decodeURIComponent(ticketId).replace(/^[#\s]+|[#\s]+$/g, "").trim();

    if (!cleanId) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid Ticket ID.",
      });
    }

    const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const contact = await Contact.findOne({
      ticketId: { $regex: new RegExp(`^${escaped}$`, "i") },
    }).select(
      "ticketId category subject message status createdAt resolvedAt adminResponse isEscalated escalatedAt"
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: `No inquiry or grievance found matching Ticket ID "${cleanId}". Please check the ID from your confirmation receipt or email.`,
      });
    }

    const daysElapsed = Math.floor(
      (new Date().getTime() - new Date(contact.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    const isEligibleForEscalation = daysElapsed >= 30 && contact.status !== "resolved";

    res.status(200).json({
      success: true,
      contact: {
        ...contact.toObject(),
        daysElapsed,
        isEligibleForEscalation,
      },
    });
  } catch (error) {
    console.error("Error tracking ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to track ticket. Please try again.",
    });
  }
};

// @desc    Escalate DPDP grievance under Section 13(3) to Grievance Redressal Officer
// @route   POST /api/contact/track/:ticketId/escalate
// @access  Public
export const escalateContactTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { reason = "" } = req.body;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID is required.",
      });
    }

    const cleanId = decodeURIComponent(ticketId).replace(/^[#\s]+|[#\s]+$/g, "").trim();
    const escaped = cleanId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const contact = await Contact.findOne({
      ticketId: { $regex: new RegExp(`^${escaped}$`, "i") },
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: `No record found matching Ticket ID "${cleanId}".`,
      });
    }

    contact.isEscalated = true;
    contact.escalatedAt = new Date();
    if (reason && reason.trim()) {
      contact.escalationReason = reason.trim();
    }
    await contact.save();

    createAdminNotification({
      category: "privacy_grievance",
      title: `🚨 STATUTORY ESCALATION [Sec 13(3)]: ${contact.ticketId}`,
      message: `Citizen escalated unresolved grievance "${contact.subject}". Priority intervention required before DPB filing.`,
      link: "/dashboard/contact-messages",
      relatedId: contact._id,
      meta: {
        ticketId: contact.ticketId,
        subject: contact.subject,
        escalatedAt: contact.escalatedAt,
        escalationReason: reason,
      },
    });

    res.status(200).json({
      success: true,
      message: `Grievance Ticket #${contact.ticketId} has been successfully flagged for immediate statutory escalation. The Grievance Redressal Officer has been alerted.`,
      contact,
    });
  } catch (error) {
    console.error("Error escalating ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process escalation. Please contact grievance@sosign.in directly.",
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
