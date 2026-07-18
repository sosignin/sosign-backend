import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const subAdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    permissions: {
      type: [String],
      default: [],
      enum: [
        "dashboard",
        "petition-approval",
        "comment-approval",
        "petitions",
        "successfulpetitions",
        "ads",
        "download-requests",
        "hide-requests",
        "blogs",
        "wallets",
        "wallet-requests",
        "users",
        "categories",
        "crowdfunding",
        "withdrawals",
        "rejected-petitions",
        "progress-updates",
        "faqs",
        "plans",
        "rapid-creation",
        "seo-research",
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
subAdminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
subAdminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const SubAdmin = mongoose.model("SubAdmin", subAdminSchema);

export default SubAdmin;
