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
  },
  { timestamps: true }
);

stallReportSchema.index({ location: "2dsphere" });

const StallReport =
  mongoose.models.StallReport ||
  mongoose.model("StallReport", stallReportSchema);

export default StallReport;
