import mongoose from "mongoose";

const dataBreachSchema = new mongoose.Schema(
  {
    breachId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Breach title / identifier is required"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["detected", "contained", "notified", "resolved", "closed"],
      default: "detected",
      index: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "high",
      index: true,
    },
    // Categorization according to Section 2(u) of the DPDP Act 2023
    category: {
      type: String,
      enum: [
        "unauthorised_processing",
        "accidental_disclosure",
        "unauthorised_acquisition",
        "unauthorised_sharing",
        "unauthorised_use",
        "unauthorised_alteration",
        "unauthorised_destruction",
        "loss_of_access",
      ],
      default: "accidental_disclosure",
      required: true,
    },
    incidentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    detectedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    containedDate: {
      type: Date,
      default: null,
    },
    affectedCollections: {
      type: [String],
      default: ["User"],
    },
    affectedDataFields: {
      type: [String],
      default: [],
    },
    estimatedAffectedCount: {
      type: Number,
      default: 0,
    },
    affectedUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    description: {
      type: String,
      required: true,
    },
    rootCause: {
      type: String,
      default: "Under forensic investigation",
    },
    harmAssessment: {
      confidentialityImpact: {
        type: String,
        enum: ["none", "low", "medium", "high"],
        default: "medium",
      },
      integrityImpact: {
        type: String,
        enum: ["none", "low", "medium", "high"],
        default: "low",
      },
      availabilityImpact: {
        type: String,
        enum: ["none", "low", "medium", "high"],
        default: "low",
      },
      riskToCitizens: {
        type: String,
        default: "Moderate risk of privacy compromise or phishing exposure.",
      },
    },
    // Audit trail of concrete actions executed to contain and reduce harm
    containmentActions: [
      {
        action: { type: String, required: true },
        executedBy: { type: String, default: "Security Admin" },
        timestamp: { type: Date, default: Date.now },
        details: { type: String, default: "" },
        affectedCount: { type: Number, default: 0 },
      },
    ],
    harmMitigationPlan: {
      type: String,
      default: "Immediate token revocation, forced re-authentication, security advisory broadcast, and endpoint firewall isolation.",
    },
    remedialAdviceForUsers: {
      type: String,
      default: "1. Update your password immediately. 2. Verify account activity. 3. Be vigilant of unsolicited emails or calls claiming to be from SoSign.",
    },
    // Statutory Intimation to Data Protection Board of India (DPBI) - Section 8(6)
    dpbiNotification: {
      status: {
        type: String,
        enum: ["drafted", "submitted", "exempt"],
        default: "drafted",
      },
      statutoryNoticeDraft: {
        type: String,
        default: "",
      },
      submittedAt: {
        type: Date,
        default: null,
      },
      referenceNumber: {
        type: String,
        default: "",
      },
      acknowledgedByBoard: {
        type: Boolean,
        default: false,
      },
      officerInCharge: {
        type: String,
        default: "Data Protection & Grievance Redressal Officer (LEO MEO IT Solution Pvt Ltd)",
      },
      notes: {
        type: String,
        default: "",
      },
    },
    // Direct Notification to affected Data Principals - Section 8(6)
    usersNotification: {
      status: {
        type: String,
        enum: ["pending", "in_progress", "completed"],
        default: "pending",
      },
      notifiedAt: {
        type: Date,
        default: null,
      },
      totalNotified: {
        type: Number,
        default: 0,
      },
      channels: {
        type: [String],
        enum: ["in_app", "email", "sms"],
        default: ["in_app", "email"],
      },
      subject: {
        type: String,
        default: "Urgent Security Notification: Important Update Regarding Your SoSign Account",
      },
      message: {
        type: String,
        default: "",
      },
      adviceSent: {
        type: String,
        default: "",
      },
    },
    createdBy: {
      type: String,
      default: "Admin",
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    postMortemReport: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Helper method to generate next sequential breach reference ID
dataBreachSchema.statics.generateNextBreachId = async function () {
  const currentYear = new Date().getFullYear();
  const prefix = `BR-${currentYear}-`;
  const latest = await this.findOne({ breachId: new RegExp(`^${prefix}`) })
    .sort({ createdAt: -1 })
    .lean();

  if (!latest) {
    return `${prefix}001`;
  }

  const lastSeq = parseInt(latest.breachId.replace(prefix, ""), 10) || 0;
  const nextSeq = String(lastSeq + 1).padStart(3, "0");
  return `${prefix}${nextSeq}`;
};

const DataBreach = mongoose.model("DataBreach", dataBreachSchema);

export default DataBreach;
