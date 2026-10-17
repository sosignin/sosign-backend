import mongoose from "mongoose";

const deletedUserArchiveSchema = new mongoose.Schema(
  {
    deletionRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeletionRequest",
      index: true,
    },
    originalUserId: {
      type: String,
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    userMobile: {
      type: String,
      default: "",
      index: true,
    },
    uniqueCode: {
      type: String,
      default: "",
    },
    reason: {
      type: String,
      default: "",
    },
    customReason: {
      type: String,
      default: "",
    },
    feedback: {
      type: String,
      default: "",
    },
    adminNote: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: String,
      default: "Administrator",
    },
    requestedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Complete frozen snapshot of user profile
    userSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Complete snapshot of all petitions created by this user
    petitionsSnapshot: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    petitionsCount: {
      type: Number,
      default: 0,
    },
    signaturesCount: {
      type: Number,
      default: 0,
    },
    // Crowdfunding campaigns snapshot
    crowdfundingSnapshot: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // Wallet & transaction snapshot
    walletSummary: {
      balance: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      withdrawalsCount: { type: Number, default: 0 },
    },
    // Legal & compliance metadata
    retentionLegalBasis: {
      type: String,
      default:
        "Retained in Legal Vault under DPDP Act 2023 Sec 8(7)/8(8) and statutory audit obligations for platform defense and dispute resolution.",
    },
  },
  {
    timestamps: true,
  }
);

// Search text index for rapid retrieval
deletedUserArchiveSchema.index({
  userName: "text",
  userEmail: "text",
  userMobile: "text",
  uniqueCode: "text",
  "petitionsSnapshot.title": "text",
});

const DeletedUserArchive =
  mongoose.models.DeletedUserArchive ||
  mongoose.model("DeletedUserArchive", deletedUserArchiveSchema);

export default DeletedUserArchive;
