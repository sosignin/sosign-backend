import crypto from "crypto";
import jwt from "jsonwebtoken";

const DEFAULT_JWT_SECRET = "GFGNB658Uvcfh54FFG";

const getJwtSecret = () => process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

const isValidVoterNumber = (voterId = "") =>
  /^[A-Z0-9/-]{10,18}$/i.test(voterId.trim());

const maskVoterNumber = (voterId = "") => {
  const val = voterId.trim();
  if (!val || val.length < 4) {
    return "******";
  }
  return `******${val.slice(-4)}`;
};

const hashVoterNumber = (voterId = "") => {
  return crypto.createHash("sha256").update(voterId.trim().toUpperCase()).digest("hex");
};

const createVoterVerificationToken = ({ userId, voterId }) => {
  if (!userId || !voterId) {
    throw new Error("Missing values for Voter ID verification token");
  }

  return jwt.sign(
    {
      purpose: "voter_verified",
      userId: userId.toString(),
      voterHash: hashVoterNumber(voterId),
    },
    getJwtSecret(),
    { expiresIn: process.env.VOTER_VERIFIED_TOKEN_EXPIRY || "30m" },
  );
};

const verifyVoterVerificationToken = (token) => {
  const decoded = jwt.verify(token, getJwtSecret());
  if (decoded.purpose !== "voter_verified") {
    throw new Error("Invalid Voter ID verification token");
  }
  return decoded;
};

export {
  isValidVoterNumber,
  maskVoterNumber,
  hashVoterNumber,
  createVoterVerificationToken,
  verifyVoterVerificationToken,
};
