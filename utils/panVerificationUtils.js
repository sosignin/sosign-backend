import crypto from "crypto";
import jwt from "jsonwebtoken";

const DEFAULT_JWT_SECRET = "GFGNB658Uvcfh54FFG";

const getJwtSecret = () => process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

const isValidPanNumber = (panNumber = "") =>
  /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber.trim().toUpperCase());

const maskPanNumber = (panNumber = "") => {
  if (!panNumber || panNumber.length < 4) {
    return "******";
  }
  return `******${panNumber.slice(-4)}`;
};

const hashPanNumber = (panNumber = "") => {
  return crypto.createHash("sha256").update(panNumber.trim().toUpperCase()).digest("hex");
};

const createPanVerificationToken = ({ userId, panNumber }) => {
  if (!userId || !panNumber) {
    throw new Error("Missing values for PAN verification token");
  }

  return jwt.sign(
    {
      purpose: "pan_verified",
      userId: userId.toString(),
      panHash: hashPanNumber(panNumber),
    },
    getJwtSecret(),
    { expiresIn: process.env.PAN_VERIFIED_TOKEN_EXPIRY || "30m" },
  );
};

const verifyPanVerificationToken = (token) => {
  const decoded = jwt.verify(token, getJwtSecret());
  if (decoded.purpose !== "pan_verified") {
    throw new Error("Invalid PAN verification token");
  }
  return decoded;
};

export {
  isValidPanNumber,
  maskPanNumber,
  hashPanNumber,
  createPanVerificationToken,
  verifyPanVerificationToken,
};
