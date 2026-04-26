import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    // Unique referral/search code for the user (e.g., for tracking signatures)
    uniqueCode: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      index: true,
    },
    designation: {
      type: String,
      required: false, // Made optional for Google sign-ups
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    mobileNumber: {
      type: String,
      required: false, // Made optional for Google sign-ups
      unique: true,
      sparse: true, // Allows null values to not violate unique constraint
    },
    password: {
      type: String,
      required: false, // Made optional for Google sign-ups
    },
    googleId: {
      type: String,
      unique: true, // Google ID should be unique
      sparse: true, // Allows null values to not violate unique constraint
    },
    bio: {
      type: String,
      maxlength: 500,
      default: "",
    },
    profilePicture: {
      type: String, // URL to the profile picture (Cloudinary)
      default: "",
    },
    petitions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Petition",
      },
    ],
    socialLinks: {
      facebook: { type: String, default: "" },
      twitter: { type: String, default: "" },
      linkedin: { type: String, default: "" },
      instagram: { type: String, default: "" },
      youtube: { type: String, default: "" },
    },
    // Password reset fields
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    isSuspended: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Helper to generate a short unique code (6-8 chars alphanumeric, uppercase)
function generateCode(length = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // exclude similar chars
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Ensure password hashing if provided
userSchema.pre("save", async function (next) {
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Auto-generate uniqueCode if missing
  if (!this.uniqueCode) {
    // Attempt a few times to avoid rare collisions
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      const exists = await mongoose.models.User.findOne({ uniqueCode: candidate }).lean();
      if (!exists) {
        this.uniqueCode = candidate;
        break;
      }
    }
    // If still missing after attempts, let Mongo's unique index catch duplicates
    if (!this.uniqueCode) {
      this.uniqueCode = generateCode() + Math.floor(Math.random() * 9);
    }
  }

  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  // Only try to match password if it exists on the user object
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
