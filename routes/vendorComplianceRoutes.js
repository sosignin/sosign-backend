import express from "express";
import {
  getVendors,
  createVendor,
  getVendorById,
  updateVendor,
  recordVendorAudit,
  dispatchVendorDeletion,
  getVendorStats,
  getCrossBorderAssessment,
  getInternalPolicies,
  getChildSafeguardsStats,
  verifyParentalConsentAction,
} from "../controllers/vendorComplianceController.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// All vendor compliance endpoints require admin authentication
router.use(adminAuth);

router.get("/stats", getVendorStats);
router.get("/internal-policies", getInternalPolicies);
router.get("/cross-border-assessment", getCrossBorderAssessment);
router.get("/child-safeguards-stats", getChildSafeguardsStats);
router.post("/verify-parental-consent/:userId", verifyParentalConsentAction);

router.route("/")
  .get(getVendors)
  .post(createVendor);

router.route("/:id")
  .get(getVendorById)
  .put(updateVendor);

router.post("/:id/audit", recordVendorAudit);
router.post("/:id/deletion-dispatch", dispatchVendorDeletion);

export default router;
