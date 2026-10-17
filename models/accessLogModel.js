import mongoose from "mongoose";

const accessLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    actorType: {
      type: String,
      enum: ["admin", "user", "visitor", "system"],
      default: "visitor",
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    actorEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      index: true,
    },
    actorName: {
      type: String,
      default: "Anonymous",
      trim: true,
    },
    role: {
      type: String,
      default: "public",
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resource: {
      type: String,
      required: true,
      index: true,
    },
    method: {
      type: String,
      default: "GET",
    },
    ipAddress: {
      type: String,
      default: "127.0.0.1",
      index: true,
    },
    userAgent: {
      type: String,
      default: "",
    },
    statusCode: {
      type: Number,
      default: 200,
      index: true,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for time-series access log filtering and auditing
accessLogSchema.index({ createdAt: -1, severity: 1 });
accessLogSchema.index({ actorEmail: 1, createdAt: -1 });
accessLogSchema.index({ ipAddress: 1, createdAt: -1 });

const AccessLog =
  mongoose.models.AccessLog || mongoose.model("AccessLog", accessLogSchema);

export default AccessLog;
