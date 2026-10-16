import express from "express";
import {
  createContactMessage,
  getAllContactMessages,
  updateContactStatus,
  deleteContactMessage,
  getContactByTicketId,
  escalateContactTicket,
} from "../controllers/contactController.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Public route for form submission
router.post("/", createContactMessage);

// Public route for tracking DPDP grievance / message ticket status
router.get("/track/:ticketId", getContactByTicketId);

// Public route for citizen Section 13(3) statutory escalation
router.post("/track/:ticketId/escalate", escalateContactTicket);

// Admin routes
router.get("/admin/all", adminAuth, getAllContactMessages);
router.put("/admin/:id/status", adminAuth, updateContactStatus);
router.post("/admin/:id/status", adminAuth, updateContactStatus);
router.delete("/admin/:id", adminAuth, deleteContactMessage);
router.post("/admin/:id/delete", adminAuth, deleteContactMessage);

export default router;
