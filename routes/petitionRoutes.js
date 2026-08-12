import express from "express";
import {
  createPetition,
  getPetitions,
  getPetitionById,
  updatePetition,
  deletePetition,
  getUserPetitions,
  signPetition,
  checkUserSignature,
  getPetitionsByCountry,
  getPopularPetitions,
  getPetitionStats,
  getSignedPetitions,
  getPetitionSigners,
  getUserPetitionsSigners,
} from "../controllers/petitionController.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";
import setCache from "../middleware/cacheMiddleware.js";

const router = express.Router();

// Base routes
router
  .route("/")
  .post(protect, upload.array("images", 4), createPetition)
  .get(setCache(60), getPetitions); // Cache list for 60s

// Special routes (must come before /:id)
router.route("/my-petitions/signers").get(protect, getUserPetitionsSigners);
router.route("/my-petitions").get(protect, getUserPetitions); // Personal, do not cache with public
router.route("/signed").get(protect, getSignedPetitions); // Petitions user has signed
router.route("/popular").get(setCache(300), getPopularPetitions); // Cache popular for 5m
router.route("/stats").get(setCache(300), getPetitionStats); // Cache stats for 5m
router.route("/country/:country").get(setCache(60), getPetitionsByCountry); // Cache country list for 60s

// ID-specific routes
router
  .route("/:id")
  .get(setCache(60), getPetitionById) // Cache details for 60s
  .put(protect, upload.array("images", 4), updatePetition)
  .post(protect, upload.array("images", 4), updatePetition)
  .delete(protect, deletePetition);

import { submitClaim } from "../controllers/requestedSignatureClaimController.js";

router.route("/:petitionId/claim-requested-signature").post(protect, submitClaim);
router.route("/:id/sign").put(protect, signPetition).post(protect, signPetition);
router.route("/:id/check-signature").get(protect, checkUserSignature);
router.route("/:id/signers").get(protect, getPetitionSigners);

export default router;
