import mongoose from "mongoose";

const trafficSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global_traffic",
      unique: true,
    },
    totalPageViews: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const Traffic = mongoose.model("Traffic", trafficSchema);
export default Traffic;
