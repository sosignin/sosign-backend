import mongoose from "mongoose";

const requestedSignatureClaimSchema = new mongoose.Schema(
  {
    petition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Petition",
      required: true,
    },
    requestedSignerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    requestedSignerName: {
      type: String,
      required: true,
    },
    requestedSignerDesignation: {
      type: String,
      default: "",
    },
    claimant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    claimantName: {
      type: String,
      required: true,
    },
    claimantEmail: {
      type: String,
      required: true,
    },
    claimantPhone: {
      type: String,
      default: "",
    },
    claimType: {
      type: String,
      enum: ["self", "authorized_representative"],
      default: "self",
    },
    proofDocumentUrl: {
      type: String,
      default: "",
    },
    videoUrl: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    adminNotes: {
      type: String,
      default: "",
    },
    actionTakenAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const RequestedSignatureClaim = mongoose.models.RequestedSignatureClaim || mongoose.model("RequestedSignatureClaim", requestedSignatureClaimSchema);

export default RequestedSignatureClaim;
