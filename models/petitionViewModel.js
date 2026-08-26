import mongoose from "mongoose";

const petitionViewSchema = new mongoose.Schema(
  {
    petition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Petition",
      required: true,
      index: true,
    },
    viewerKey: {
      type: String,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    ip: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  { timestamps: true }
);

// Compound unique index ensuring only 1 unique view record per viewerKey per petition
petitionViewSchema.index({ petition: 1, viewerKey: 1 }, { unique: true });

const PetitionView = mongoose.model("PetitionView", petitionViewSchema);
export default PetitionView;
