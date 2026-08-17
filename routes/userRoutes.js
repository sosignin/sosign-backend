import express from "express";
import {
  authUser,
  registerUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  authGoogleUser,
  getUserByCode,
  getUserPublicProfile,
  followUser,
  forgotPassword,
  resetPassword,
  changePassword,
} from "../controllers/userController.js";
import { protect, getOptionalUser } from "../middleware/authMiddleware.js";
import profileUpload from "../middleware/profileUpload.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", authUser);
router.post("/logout", logoutUser);
router.route("/profile")
  .get(protect, getUserProfile)
  .put(protect, profileUpload.single("profilePicture"), updateUserProfile)
  .post(protect, profileUpload.single("profilePicture"), updateUserProfile);
router.post("/google-auth", authGoogleUser);
router.get("/code/:code", getUserByCode);
router.get("/public/:id", getOptionalUser, getUserPublicProfile);
router.post("/:id/follow", protect, followUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.route("/change-password")
  .put(protect, changePassword)
  .post(protect, changePassword);

export default router;
