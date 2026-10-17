import mongoose from "mongoose";

const deletionRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
      trim: true,
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
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "Privacy concerns & DPDP Act Right to Erasure",
        "No longer need the platform",
        "Created account by mistake / Duplicate account",
        "Want to remove all my petitions and data",
        "Other reason",
      ],
      default: "Privacy concerns & DPDP Act Right to Erasure",
    },
    customReason: {
      type: String,
      default: "",
    },
    feedback: {
      type: String,
      default: "",
    },
    petitionsCount: {
      type: Number,
      default: 0,
    },
    signaturesCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    adminNote: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: String,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    archiveId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeletedUserArchive",
      default: null,
    },
    archivedData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const DeletionRequest = mongoose.model("DeletionRequest", deletionRequestSchema);

export default DeletionRequest;
