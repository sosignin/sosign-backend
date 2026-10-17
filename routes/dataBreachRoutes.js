import express from "express";
import {
  getBreaches,
  createBreach,
  getBreachById,
  updateBreach,
  containBreachAction,
  generateDpbiNoticeAction,
  recordDpbiSubmissionAction,
  notifyAffectedUsersAction,
  getBreachStats,
  getBreachSop,
} from "../controllers/dataBreachController.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Require admin authentication for all breach management endpoints
router.use(adminAuth);

router.get("/stats", getBreachStats);
router.get("/sop-plan", getBreachSop);

router.route("/")
  .get(getBreaches)
  .post(createBreach);

router.route("/:id")
  .get(getBreachById)
  .put(updateBreach);

// DPDP Action Endpoints
router.post("/:id/contain", containBreachAction);
router.post("/:id/generate-dpbi-notice", generateDpbiNoticeAction);
router.post("/:id/record-dpbi-submission", recordDpbiSubmissionAction);
router.post("/:id/notify-users", notifyAffectedUsersAction);

export default router;
