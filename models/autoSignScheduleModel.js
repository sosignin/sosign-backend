import mongoose from "mongoose";

const autoSignScheduleSchema = new mongoose.Schema(
  {
    petition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Petition",
      required: [true, "Target petition is required"],
    },
    totalSignaturesTarget: {
      type: Number,
      required: [true, "Total signatures target is required"],
      min: [1, "Total signatures target must be at least 1"],
    },
    signaturesAdded: {
      type: Number,
      default: 0,
      min: 0,
    },
    batchSize: {
      type: Number,
      default: 5,
      min: [1, "Batch size must be at least 1"],
    },
    intervalSeconds: {
      type: Number,
      default: 300, // 5 minutes default
      min: [5, "Interval must be at least 5 seconds"],
    },
    useSameMobile: {
      type: String,
      default: "9999990000",
    },
    randomJitter: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["running", "paused", "completed", "cancelled", "failed"],
      default: "running",
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    nextRunAt: {
      type: Date,
      default: Date.now,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    logs: [
      {
        addedCount: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now },
        currentTotal: { type: Number, required: true },
        petitionSignatureCount: { type: Number },
        note: { type: String, default: "" },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for fast query of runnable tasks
autoSignScheduleSchema.index({ status: 1, nextRunAt: 1 });

const AutoSignSchedule = mongoose.model("AutoSignSchedule", autoSignScheduleSchema);

export default AutoSignSchedule;
