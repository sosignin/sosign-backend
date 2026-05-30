import mongoose from "mongoose";

// Helper function to generate URL-friendly slug from title
function generateSlug(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Replace multiple hyphens with single
    .replace(/^-|-$/g, '')         // Remove leading/trailing hyphens
    .substring(0, 100);            // Limit length
}

const petitionSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    decisionMakers: [
      {
        name: { type: String, required: true },
        organization: { type: String },
        email: { type: String },  // Optional - frontend allows empty email
        phone: { type: String },
      },
    ],
    country: {
      type: String,
      required: true,
    },
    categories: [{
      type: String,
      // No enum constraint - allows dynamic category creation
    }],
    petitionDetails: {
      problem: { type: String, required: true },
      solution: { type: String, required: true },
      image: { type: String }, // URL to the primary image (for backward compatibility)
      images: [{ type: String }], // Array of URLs for all images
      videoUrl: { type: String },
    },
    petitionStarter: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      name: { type: String, required: true },
      age: { type: Number },
      mobile: { type: String, required: true },
      location: { type: String },
      comment: { type: String },
      aadharNumber: { type: String, required: false },
      panNumber: { type: String },
      voterNumber: { type: String },
      pincode: { type: String },
      mpConstituencyNumber: { type: String },
      mlaConstituencyNumber: { type: String },
    },
    numberOfSignatures: {
      type: Number,
      default: 0,
    },
    targetSignatures: {
      type: Number,
      default: 0,
      min: 0,
    },
    signatures: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        // Optional referral tracking: who referred and via which code
        referral: {
          code: { type: String },
          owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        },
        constituencyNumber: { type: String },  // Constituency number of the signer
        aadharNumber: { type: String },        // Aadhar number of the signer
        signedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
    },
    approved: {
      type: Boolean,
      default: false,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
    hiddenAt: {
      type: Date,
    },
    // Constituency requirement settings
    constituencySettings: {
      required: { type: Boolean, default: false },  // Is constituency number mandatory to sign?
      allowedConstituency: { type: String },         // If set, only users with this constituency can sign
    },
    // New signing requirements settings (supports both constituency and aadhar)
    signingRequirements: {
      constituency: {
        required: { type: Boolean, default: false },  // Is constituency number mandatory to sign?
        allowedConstituency: { type: String },         // If set, only users with this constituency can sign
      },
      aadhar: {
        required: { type: Boolean, default: false },  // Is aadhar number mandatory to sign?
      },
    },
    // Legacy overall campaign progress percentage
    progressPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to generate slug from title
petitionSchema.pre('save', async function (next) {
  // Only generate slug if title is modified or slug doesn't exist
  if (this.isModified('title') || !this.slug) {
    let baseSlug = generateSlug(this.title);
    let slug = baseSlug;
    let counter = 1;

    // Check for existing slugs and add suffix if needed
    while (true) {
      const existingPetition = await mongoose.model('Petition').findOne({
        slug: slug,
        _id: { $ne: this._id }
      });

      if (!existingPetition) {
        break;
      }

      // Add counter suffix for duplicate titles
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }
  next();
});

// Indexes for performance optimization
petitionSchema.index({ approved: 1, hidden: 1, createdAt: -1 }); // For default listing (recent active petitions)
petitionSchema.index({ approved: 1, hidden: 1, numberOfSignatures: -1 }); // For popular active petitions
petitionSchema.index({ approved: 1, hidden: 1, categories: 1 }); // For filtering by category
petitionSchema.index({ approved: 1, hidden: 1, country: 1 }); // For filtering by country
petitionSchema.index({ "petitionStarter.user": 1 }); // For finding user's petitions

const Petition = mongoose.model("Petition", petitionSchema);

export default Petition;
