import mongoose from "mongoose";

const donationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: { type: String, default: "Anonymous" },
  amount: { type: Number, required: true },
  transactionId: { type: String, required: true }, // Dummy ID for now
  createdAt: { type: Date, default: Date.now },
});

const crowdfundingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, required: true, default: "Medical" },
    story: { type: String, required: true },
    image: { type: String }, // Main campaign image URL
    goalAmount: { type: Number, required: true },
    raisedAmount: { type: Number, default: 0 },
    withdrawnAmount: { type: Number, default: 0 },
    donorsCount: { type: Number, default: 0 },
    deadline: { type: Date, required: true },
    location: { type: String, required: true },
    
    // Identity & Verification
    beneficiaryName: { type: String, required: true },
    beneficiaryAadhaar: { type: String }, // Legacy Cloudinary URL
    beneficiaryPan: { type: String }, // Legacy Cloudinary URL
    organizerAadhaarPan: { type: String }, // Legacy Cloudinary URL
    identityVerification: {
      aadhaar: {
        status: { type: String, enum: ["not_verified", "verified"], default: "not_verified" },
        maskedAadhaar: { type: String, default: "" },
        verifiedAt: { type: Date, default: null },
      },
      pan: {
        status: { type: String, enum: ["not_verified", "verified"], default: "not_verified" },
        panNumber: { type: String, default: "" },
        verifiedAt: { type: Date, default: null },
      },
    },
    organizerPhone: { type: String, required: true },
    isPhoneVerified: { type: Boolean, default: false },

    // Medical Proof
    medicalDetails: {
      hospitalName: { type: String },
      doctorName: { type: String },
      reports: [{ type: String }], // Array of Cloudinary URLs
    },

    // Bank Details
    bankDetails: {
      accountHolderName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      ifscCode: { type: String, required: true },
      bankName: { type: String, required: true },
      cancelledCheque: { type: String }, // Cloudinary URL
    },

    // Settings
    settings: {
      minDonation: { type: Number, default: 100 },
      suggestedAmounts: { type: [Number], default: [100, 500, 1000] },
    },

    // Legal
    legalAccepted: { type: Boolean, default: false },
    infoVerifiedByUser: { type: Boolean, default: false },

    // Meta
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approved: { type: Boolean, default: false }, // Set to false so it requires admin approval
    donations: [donationSchema],
    slug: { type: String, unique: true },
  },
  { timestamps: true }
);

// Generate slug before saving
crowdfundingSchema.pre("save", function (next) {
  if (this.isModified("title") || !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
      
    // Add unique identifier to slug to avoid collisions
    this.slug = `${this.slug}-${Math.random().toString(36).substring(2, 7)}`;
  }
  next();
});

const Crowdfunding = mongoose.model("Crowdfunding", crowdfundingSchema);
export default Crowdfunding;
