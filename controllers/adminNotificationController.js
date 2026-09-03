import asyncHandler from "express-async-handler";
import AdminNotification from "../models/adminNotificationModel.js";
import Petition from "../models/petitionModel.js";
import Comment from "../models/commentModel.js";
import StallReport from "../models/stallReportModel.js";
import School from "../models/schoolModel.js";
import PetitionReport from "../models/petitionReportModel.js";
import RequestedSignatureClaim from "../models/requestedSignatureClaimModel.js";
import DownloadRequest from "../models/downloadRequestModel.js";
import HideRequest from "../models/hideRequestModel.js";
import Contact from "../models/contactModel.js";
import WalletRequest from "../models/walletRequestModel.js";
import Crowdfunding from "../models/crowdfundingModel.js";
import Withdrawal from "../models/withdrawalModel.js";

// @desc    Get paginated admin notifications
// @route   GET /api/admin/notifications
// @access  Admin
export const getAdminNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const { status, category, search } = req.query;

  const query = {};

  if (status === "unread") {
    query.isRead = false;
  } else if (status === "read") {
    query.isRead = true;
  }

  if (category && category !== "all") {
    query.category = category;
  }

  if (search && search.trim()) {
    query.$or = [
      { title: { $regex: search.trim(), $options: "i" } },
      { message: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const total = await AdminNotification.countDocuments(query);
  const unreadCount = await AdminNotification.countDocuments({ isRead: false });

  const notifications = await AdminNotification.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    notifications,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    },
    unreadCount,
  });
});

// @desc    Get live badge counts for all sidebar sections & latest notifications
// @route   GET /api/admin/notifications/counts
// @access  Admin
export const getAdminNotificationCounts = asyncHandler(async (req, res) => {
  // Concurrently query live pending counts across all 13 monitored models
  const [
    petitionApprovalCount,
    commentApprovalCount,
    stallReportsCount,
    schoolRequestsCount,
    stallDisputesCount,
    petitionReportsCount,
    signatureClaimsCount,
    downloadRequestsCount,
    hideRequestsCount,
    contactMessagesCount,
    walletRequestsCount,
    crowdfundingCount,
    withdrawalsCount,
    unreadNotifCount,
    latestNotifications,
  ] = await Promise.all([
    // 1. Petition Approval (pending petitions or pending updates, excluding rejected)
    Petition.countDocuments({
      status: { $ne: "rejected" },
      $or: [
        { status: "pending" },
        { approved: false },
        { hasPendingUpdates: true },
      ],
    }).catch(() => 0),

    // 2. Comment Approval (unapproved comments)
    Comment.countDocuments({ isApproved: false }).catch(() => 0),

    // 3. Stall Reports (pending citizen stall reports)
    StallReport.countDocuments({ status: "pending" }).catch(() => 0),

    // 4. School Requests (pending school additions)
    School.countDocuments({
      $or: [{ status: "pending" }, { isApproved: false }],
    }).catch(() => 0),

    // 5. Stall Disputes (reports with pending vendor defenses)
    StallReport.countDocuments({ "defenses.status": "pending" }).catch(() => 0),

    // 6. Petition Objections (pending citizen formal reports/objections)
    PetitionReport.countDocuments({
      status: { $in: ["Pending", "Under Review"] },
    }).catch(() => 0),

    // 7. Signature Claims (pending VIP / leader signature claims)
    RequestedSignatureClaim.countDocuments({ status: "Pending" }).catch(() => 0),

    // 8. Download Requests (pending signer data download requests)
    DownloadRequest.countDocuments({ status: "pending" }).catch(() => 0),

    // 9. Hide Requests (pending petition hide requests)
    HideRequest.countDocuments({ status: "pending" }).catch(() => 0),

    // 10. Contact Messages (unread visitor inquiries)
    Contact.countDocuments({ status: "unread" }).catch(() => 0),

    // 11. Wallet Requests (pending UPI recharge proof verifications)
    WalletRequest.countDocuments({
      status: { $in: ["pending", "verification_pending"] },
    }).catch(() => 0),

    // 12. Crowdfunding Campaigns (unapproved campaigns)
    Crowdfunding.countDocuments({ approved: false }).catch(() => 0),

    // 13. Withdrawal Requests (pending campaign funds withdrawals)
    Withdrawal.countDocuments({ status: "pending" }).catch(() => 0),

    // Stored unread admin notifications count
    AdminNotification.countDocuments({ isRead: false }).catch(() => 0),

    // Top 8 recent notifications for preview in header bell dropdown
    AdminNotification.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .lean()
      .catch(() => []),
  ]);

  const badges = {
    petitionApproval: petitionApprovalCount,
    commentApproval: commentApprovalCount,
    stallReports: stallReportsCount,
    schoolRequests: schoolRequestsCount,
    stallDisputes: stallDisputesCount,
    petitionReports: petitionReportsCount,
    signatureClaims: signatureClaimsCount,
    downloadRequests: downloadRequestsCount,
    hideRequests: hideRequestsCount,
    contactMessages: contactMessagesCount,
    walletRequests: walletRequestsCount,
    crowdfunding: crowdfundingCount,
    withdrawals: withdrawalsCount,
  };

  const totalPendingAction = Object.values(badges).reduce((acc, count) => acc + count, 0);

  res.status(200).json({
    success: true,
    unreadCount: unreadNotifCount,
    totalPendingAction,
    badges,
    latest: latestNotifications,
  });
});

// @desc    Mark single notification as read
// @route   PUT /api/admin/notifications/:id/read
// @access  Admin
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const notification = await AdminNotification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    success: true,
    message: "Notification marked as read",
    notification,
  });
});

// @desc    Mark all notifications as read
// @route   PUT /api/admin/notifications/mark-all-read
// @access  Admin
export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  await AdminNotification.updateMany({ isRead: false }, { isRead: true });

  res.status(200).json({
    success: true,
    message: "All notifications marked as read",
  });
});

// @desc    Delete single notification
// @route   DELETE /api/admin/notifications/:id
// @access  Admin
export const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await AdminNotification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }

  await AdminNotification.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: "Notification deleted successfully",
  });
});

// @desc    Clear read notifications (or all if force is provided)
// @route   DELETE /api/admin/notifications/clear-all
// @access  Admin
export const clearAllNotifications = asyncHandler(async (req, res) => {
  const { all } = req.query;
  const filter = all === "true" ? {} : { isRead: true };

  const result = await AdminNotification.deleteMany(filter);

  res.status(200).json({
    success: true,
    message: `Cleared ${result.deletedCount} notifications`,
  });
});

// @desc    Sync / backfill notifications from existing pending items in DB
// @route   POST /api/admin/notifications/sync-pending
// @access  Admin
export const syncPendingNotifications = asyncHandler(async (req, res) => {
  let createdCount = 0;

  // 1. Pending petitions
  const pendingPetitions = await Petition.find({
    status: { $ne: "rejected" },
    $or: [{ status: "pending" }, { approved: false }, { hasPendingUpdates: true }],
  }).limit(50);

  for (const pet of pendingPetitions) {
    const exists = await AdminNotification.findOne({
      category: "petition_approval",
      relatedId: pet._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "petition_approval",
        title: pet.hasPendingUpdates ? "Petition Updates Submitted" : "New Petition for Approval",
        message: `Petition "${pet.title}" requires admin review`,
        link: "/dashboard/petition-approval",
        relatedId: pet._id,
        createdAt: pet.updatedAt || pet.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 2. Pending comments
  const pendingComments = await Comment.find({ isApproved: false }).limit(50);
  for (const c of pendingComments) {
    const exists = await AdminNotification.findOne({
      category: "comment_approval",
      relatedId: c._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "comment_approval",
        title: "New Comment for Approval",
        message: `User comment "${c.content.slice(0, 50)}..." awaiting approval`,
        link: "/dashboard/comment-approval",
        relatedId: c._id,
        createdAt: c.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 3. Pending stall reports
  const pendingStallReports = await StallReport.find({ status: "pending" }).limit(50);
  for (const sr of pendingStallReports) {
    const exists = await AdminNotification.findOne({
      category: "stall_report",
      relatedId: sr._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "stall_report",
        title: "New Stall Report 🚨",
        message: `Stall report filed for "${sr.shopName}" (${sr.city || "School zone"})`,
        link: "/dashboard/stall-reports",
        relatedId: sr._id,
        createdAt: sr.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 4. Pending school requests
  const pendingSchools = await School.find({
    $or: [{ status: "pending" }, { isApproved: false }],
  }).limit(50);
  for (const s of pendingSchools) {
    const exists = await AdminNotification.findOne({
      category: "school_request",
      relatedId: s._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "school_request",
        title: "New School Request 🏫",
        message: `Citizen requested addition of school "${s.name}" in ${s.city}`,
        link: "/dashboard/school-requests",
        relatedId: s._id,
        createdAt: s.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 5. Pending stall disputes
  const disputeReports = await StallReport.find({ "defenses.status": "pending" }).limit(50);
  for (const dr of disputeReports) {
    const pendingDefenses = (dr.defenses || []).filter((d) => d.status === "pending");
    for (const d of pendingDefenses) {
      const exists = await AdminNotification.findOne({
        category: "stall_dispute",
        relatedId: d._id,
      });
      if (!exists) {
        await AdminNotification.create({
          category: "stall_dispute",
          title: "New Stall Dispute Defense 🛡️",
          message: `Vendor "${d.vendorName}" filed a dispute defense on stall "${dr.shopName}"`,
          link: "/dashboard/stall-disputes",
          relatedId: d._id,
          createdAt: d.submittedAt || dr.updatedAt || new Date(),
          isRead: false,
        });
        createdCount++;
      }
    }
  }

  // 6. Pending petition reports / objections
  const pendingReports = await PetitionReport.find({
    status: { $in: ["Pending", "Under Review"] },
  }).limit(50);
  for (const pr of pendingReports) {
    const exists = await AdminNotification.findOne({
      category: "petition_report",
      relatedId: pr._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "petition_report",
        title: "New Petition Objection 🚩",
        message: `Objection filed: "${pr.reason}"`,
        link: "/dashboard/petition-reports",
        relatedId: pr._id,
        createdAt: pr.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 7. Pending signature claims
  const pendingClaims = await RequestedSignatureClaim.find({ status: "Pending" }).limit(50);
  for (const sc of pendingClaims) {
    const exists = await AdminNotification.findOne({
      category: "signature_claim",
      relatedId: sc._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "signature_claim",
        title: "New Signature Claim ✍️",
        message: `Claim filed by ${sc.claimantName} for "${sc.requestedSignerName}"`,
        link: "/dashboard/requested-signature-claims",
        relatedId: sc._id,
        createdAt: sc.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 8. Pending download requests
  const pendingDownloads = await DownloadRequest.find({ status: "pending" }).limit(50);
  for (const dl of pendingDownloads) {
    const exists = await AdminNotification.findOne({
      category: "download_request",
      relatedId: dl._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "download_request",
        title: "New Signer Data Download Request",
        message: `User requested to download signature data`,
        link: "/dashboard/download-requests",
        relatedId: dl._id,
        createdAt: dl.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 9. Pending hide requests
  const pendingHides = await HideRequest.find({ status: "pending" }).limit(50);
  for (const hr of pendingHides) {
    const exists = await AdminNotification.findOne({
      category: "hide_request",
      relatedId: hr._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "hide_request",
        title: "New Petition Hide Request",
        message: `Creator requested to hide their petition`,
        link: "/dashboard/hide-requests",
        relatedId: hr._id,
        createdAt: hr.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 10. Unread contact messages
  const unreadContacts = await Contact.find({ status: "unread" }).limit(50);
  for (const cm of unreadContacts) {
    const exists = await AdminNotification.findOne({
      category: "contact_message",
      relatedId: cm._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "contact_message",
        title: "New Contact Message 📩",
        message: `Message from ${cm.name}: "${cm.subject}"`,
        link: "/dashboard/contact-messages",
        relatedId: cm._id,
        createdAt: cm.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 11. Pending wallet recharge requests
  const pendingWallets = await WalletRequest.find({
    status: { $in: ["pending", "verification_pending"] },
  }).limit(50);
  for (const wr of pendingWallets) {
    const exists = await AdminNotification.findOne({
      category: "wallet_request",
      relatedId: wr._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "wallet_request",
        title: "New Wallet Recharge Request",
        message: `Payment proof submitted for ₹${wr.amount} (${wr.points} points)`,
        link: "/dashboard/wallet-requests",
        relatedId: wr._id,
        createdAt: wr.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 12. Pending crowdfunding campaigns
  const pendingCrowdfundings = await Crowdfunding.find({ approved: false }).limit(50);
  for (const cf of pendingCrowdfundings) {
    const exists = await AdminNotification.findOne({
      category: "crowdfunding_approval",
      relatedId: cf._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "crowdfunding_approval",
        title: "New Crowdfunding Campaign",
        message: `Campaign "${cf.title}" submitted for approval (Goal: ₹${cf.goalAmount})`,
        link: "/dashboard/crowdfunding",
        relatedId: cf._id,
        createdAt: cf.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  // 13. Pending withdrawals
  const pendingWithdrawals = await Withdrawal.find({ status: "pending" }).limit(50);
  for (const wd of pendingWithdrawals) {
    const exists = await AdminNotification.findOne({
      category: "withdrawal_request",
      relatedId: wd._id,
    });
    if (!exists) {
      await AdminNotification.create({
        category: "withdrawal_request",
        title: "New Withdrawal Request",
        message: `Creator requested withdrawal of ₹${wd.amount}`,
        link: "/dashboard/withdrawals",
        relatedId: wd._id,
        createdAt: wd.createdAt || new Date(),
        isRead: false,
      });
      createdCount++;
    }
  }

  res.status(200).json({
    success: true,
    message: `Sync complete. Generated ${createdCount} new notifications from pending records.`,
    createdCount,
  });
});
