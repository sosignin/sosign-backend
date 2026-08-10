import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    state: {
      type: String,
      default: "Maharashtra",
      index: true,
    },
    address: {
      type: String,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [75.7139, 19.7515], // Default Maharashtra state center
      },
    },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "approved",
      index: true,
    },
    isApproved: {
      type: Boolean,
      default: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

schoolSchema.index({ location: "2dsphere" });

const School = mongoose.models.School || mongoose.model("School", schoolSchema);

export default School;
