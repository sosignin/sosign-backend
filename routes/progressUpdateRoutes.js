import express from "express";
import {
  createProgressUpdate,
  getProgressUpdates,
  getProgressUpdateById,
  deleteProgressUpdate,
  reactToUpdate,
  updateProgressPercentage,
} from "../controllers/progressUpdateController.js";
import { protect, getOptionalUser } from "../middleware/authMiddleware.js";
import { uploadProgressFiles } from "../middleware/upload.js";

const router = express.Router();

// Routes for a specific petition's progress updates
router
  .route("/:petitionId")
  .get(getOptionalUser, getProgressUpdates) // Anyone can view, optionally authenticated for reaction status
  .post(
    protect,
    uploadProgressFiles.fields([
      { name: "images", maxCount: 4 },
      { name: "documents", maxCount: 2 },
    ]),
    createProgressUpdate
  );

// Route to update target signatures used for progress display
router.route("/:petitionId/progress").put(protect, updateProgressPercentage);

// Routes for a specific progress update
router.route("/update/:id").get(getOptionalUser, getProgressUpdateById);
router.route("/:id").delete(protect, deleteProgressUpdate);
router.route("/:id/react").put(protect, reactToUpdate);

export default router;
