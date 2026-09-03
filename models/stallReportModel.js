import mongoose from "mongoose";

const stallReportSchema = new mongoose.Schema(
  {
    petitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Petition",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    city: {
      type: String,
      required: true,
      index: true,
    },
    district: {
      type: String,
      trim: true,
      index: true,
    },
    taluka: {
      type: String,
      trim: true,
    },
    villageTown: {
      type: String,
      trim: true,
    },
    landmark: {
      type: String,
      trim: true,
    },
    grievanceId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      index: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    shopName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    images: [{
      type: String,
    }],
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude] of shop
        required: true,
      },
    },
    distanceFromSchoolMeters: {
      type: Number,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    rejectionReason: {
      type: String,
    },
    defenses: [
      {
        vendorName: { type: String, required: true, trim: true },
        vendorContact: { type: String, trim: true },
        reason: {
          type: String,
          enum: ["not_within_50m", "stall_shifted", "closed_down", "has_permission", "other"],
          required: true,
        },
        explanation: { type: String, required: true, trim: true },
        newGoogleMapsUrl: { type: String, trim: true },
        status: {
          type: String,
          enum: ["pending", "reviewed_dismissed", "approved_resolved"],
          default: "pending",
        },
        submittedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

stallReportSchema.index({ location: "2dsphere" });

const StallReport =
  mongoose.models.StallReport ||
  mongoose.model("StallReport", stallReportSchema);

export default StallReport;
