import mongoose from "mongoose";

const backupLogSchema = new mongoose.Schema(
  {
    backupId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
    },
    filepath: {
      type: String,
      required: true,
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    totalDocuments: {
      type: Number,
      default: 0,
    },
    collectionsBackedUp: [
      {
        name: { type: String, required: true },
        count: { type: Number, default: 0 },
      },
    ],
    checksumSha256: {
      type: String,
      default: "",
    },
    triggeredBy: {
      type: {
        type: String,
        enum: ["system_cron", "admin"],
        default: "system_cron",
      },
      adminEmail: { type: String, default: "" },
      adminName: { type: String, default: "Automated System" },
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "failed"],
      default: "in_progress",
      index: true,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    retentionUntil: {
      type: Date,
      index: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

backupLogSchema.index({ createdAt: -1 });

const BackupLog =
  mongoose.models.BackupLog || mongoose.model("BackupLog", backupLogSchema);

export default BackupLog;
