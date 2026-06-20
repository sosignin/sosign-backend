import mongoose from "mongoose";

const progressUpdateSchema = mongoose.Schema(
  {
    petition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Petition",
      required: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    updateType: {
      type: String,
      enum: ["text", "image", "document", "milestone", "video"],
      default: "text",
    },
    images: [{ type: String }], // Cloudinary URLs
    documents: [
      {
        url: { type: String, required: true },
        filename: { type: String, required: true },
        fileType: { type: String, required: true }, // e.g. "application/pdf"
      },
    ],
    videoUrl: { type: String }, // External video link
    milestone: {
      label: { type: String },
      status: {
        type: String,
        enum: ["pending", "in_progress", "completed"],
        default: "pending",
      },
    },
    progressPercentage: {
      type: Number,
      min: 0,
      max: 100,
    }, // Optional overall % update
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        type: {
          type: String,
          enum: ["like"], // Can add more types later like 'celebrate', 'support'
          default: "like",
        },
        reactedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isApproved: {
      type: Boolean,
      default: true, // Assuming auto-published since only creators/admins can post
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster querying
progressUpdateSchema.index({ petition: 1, createdAt: -1 });
progressUpdateSchema.index({ author: 1 });

const ProgressUpdate = mongoose.model("ProgressUpdate", progressUpdateSchema);

export default ProgressUpdate;
