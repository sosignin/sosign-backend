import mongoose from "mongoose";

const victoryRequestSchema = mongoose.Schema(
  {
    petition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Petition",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    petitionTitle: {
      type: String,
      required: true,
      trim: true,
    },
    totalSignatures: {
      type: Number,
      default: 0,
    },
    outcome: {
      type: String,
      default: "Goal achieved through community support",
      trim: true,
    },
    story: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    adminNote: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: String,
      default: "",
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find pending requests for a petition
victoryRequestSchema.index({ petition: 1, status: 1 });
victoryRequestSchema.index({ user: 1, createdAt: -1 });

const VictoryRequest = mongoose.model("VictoryRequest", victoryRequestSchema);

export default VictoryRequest;
