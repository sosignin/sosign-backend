import mongoose from "mongoose";

const petitionReportSchema = new mongoose.Schema(
  {
    petition: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Petition",
      required: true,
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: [true, "Please select a reason for reporting"],
      enum: [
        "Hate Speech / Discrimination",
        "Misleading / Fake Information",
        "Copyright / Trademark Violation",
        "Defamatory / Illegal Content",
        "Personal Harassment / Privacy Concern",
        "Spam / Fraudulent Petition",
        "Other Objection",
      ],
    },
    description: {
      type: String,
      required: [true, "Please provide objection details"],
      trim: true,
    },
    evidenceUrl: {
      type: String,
      default: "",
    },
    reporterAadhaarName: {
      type: String,
      default: "",
    },
    reporterMaskedAadhaar: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["Pending", "Under Review", "Resolved (Taken Down)", "Dismissed"],
      default: "Pending",
    },
    adminNotes: {
      type: String,
      default: "",
    },
    actionTakenAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const PetitionReport = mongoose.model("PetitionReport", petitionReportSchema);
export default PetitionReport;
