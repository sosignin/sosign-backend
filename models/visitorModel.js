import mongoose from "mongoose";

const visitorSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: String, // Format: YYYY-MM-DD
      required: true,
      index: true,
    },
    pageViews: {
      type: Number,
      default: 1,
    },
    lastPath: {
      type: String,
      default: "/",
    },
    userAgent: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Unique index for one record per IP per day
visitorSchema.index({ ip: 1, date: 1 }, { unique: true });

const Visitor = mongoose.model("Visitor", visitorSchema);
export default Visitor;
