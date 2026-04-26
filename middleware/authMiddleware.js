import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../models/userModel.js";

const getBearerToken = (authorizationHeader = "") => {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.split(" ")[1] || null;
};

const sanitizeToken = (token = "") => {
  return String(token).trim().replace(/^"|"$/g, "");
};

const extractCandidateTokens = (req) => {
  const tokens = [];

  const bearerToken = getBearerToken(req.headers.authorization);
  if (bearerToken) {
    tokens.push(sanitizeToken(bearerToken));
  }

  const cookieToken = req.cookies?.jwt;
  if (cookieToken) {
    tokens.push(sanitizeToken(cookieToken));
  }

  return [...new Set(tokens.filter(Boolean))];
};

const protect = asyncHandler(async (req, res, next) => {
  const tokenCandidates = extractCandidateTokens(req);

  if (!tokenCandidates.length) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }

  let decodedToken = null;
  let lastVerifyError = null;

  for (const token of tokenCandidates) {
    try {
      decodedToken = jwt.verify(
        token,
        process.env.JWT_SECRET || "default_jwt_secret_key",
      );
      break;
    } catch (error) {
      lastVerifyError = error;
    }
  }

  if (!decodedToken) {
    if (lastVerifyError?.name === "TokenExpiredError") {
      res.status(401);
      throw new Error("Not authorized, token expired");
    }

    res.status(401);
    throw new Error("Not authorized, token failed");
  }

  req.user = await User.findById(decodedToken.userId).select("-password");

  if (!req.user) {
    res.status(401);
    throw new Error("User not found");
  }

  if (req.user.isSuspended) {
    res.status(403);
    throw new Error("Your account has been suspended. Please contact support.");
  }

  next();
});

const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorized as an admin");
  }
};

export { protect, admin };
