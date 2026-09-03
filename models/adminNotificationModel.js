import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: [
        "petition_approval",     // Petition Approval (/dashboard/petition-approval)
        "comment_approval",      // Comment Approval (/dashboard/comment-approval)
        "stall_report",         // Stall Reports (/dashboard/stall-reports)
        "school_request",       // School Requests (/dashboard/school-requests)
        "stall_dispute",        // Stall Disputes (/dashboard/stall-disputes)
        "petition_report",      // Petition Objections (/dashboard/petition-reports)
        "signature_claim",      // Signature Claims (/dashboard/requested-signature-claims)
        "download_request",     // Download Requests (/dashboard/download-requests)
        "hide_request",         // Hide Requests (/dashboard/hide-requests)
        "contact_message",      // Contact Messages (/dashboard/contact-messages)
        "wallet_request",       // Wallet Requests (/dashboard/wallet-requests)
        "crowdfunding_approval",// Crowdfunding Approval (/dashboard/crowdfunding)
        "withdrawal_request",   // Withdrawal Requests (/dashboard/withdrawals)
        "system",               // System / General alerts
      ],
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    link: {
      type: String,
      required: true,
      default: "/dashboard",
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying unread notifications sorted by recency
adminNotificationSchema.index({ isRead: 1, createdAt: -1 });
adminNotificationSchema.index({ category: 1, createdAt: -1 });

const AdminNotification =
  mongoose.models.AdminNotification ||
  mongoose.model("AdminNotification", adminNotificationSchema);

export default AdminNotification;
