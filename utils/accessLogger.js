import AccessLog from "../models/accessLogModel.js";
import { getCleanIp } from "./ipHelper.js";

/**
 * Programmatically record an access / security log entry
 */
export const logAccessEvent = async ({
  req,
  action,
  resource,
  method,
  actorType = "visitor",
  actorId = null,
  actorEmail = "",
  actorName = "",
  role = "public",
  statusCode = 200,
  durationMs = 0,
  severity = "low",
  details = {},
}) => {
  try {
    let resolvedIp = "127.0.0.1";
    let resolvedUserAgent = "";

    if (req) {
      resolvedIp = getCleanIp(req);
      resolvedUserAgent = req.headers["user-agent"] || "";
      if (!resource) resource = req.originalUrl || req.url;
      if (!method) method = req.method;

      // Extract actor from req.admin or req.user if present
      if (req.admin) {
        actorType = "admin";
        actorId = req.admin.id || req.admin._id || actorId;
        actorEmail = req.admin.email || actorEmail;
        actorName = req.admin.name || "Admin";
        role = req.admin.role || "admin";
      } else if (req.user) {
        actorType = "user";
        actorId = req.user._id || actorId;
        actorEmail = req.user.email || actorEmail;
        actorName = req.user.name || "User";
        role = "citizen";
      }
    }

    // Auto-escalate severity for sensitive actions or failures
    if (statusCode === 401 || statusCode === 403) {
      if (severity === "low") severity = "high";
    }
    if (statusCode >= 500 && severity === "low") {
      severity = "medium";
    }

    const logEntry = await AccessLog.create({
      actorType,
      actorId,
      actorEmail,
      actorName,
      role,
      action: action || "api_access",
      resource: resource || "/api",
      method: method || "GET",
      ipAddress: resolvedIp,
      userAgent: resolvedUserAgent,
      statusCode,
      durationMs,
      severity,
      details,
    });

    return logEntry;
  } catch (err) {
    // Non-blocking error handling so logging never breaks core user operations
    console.debug("Failed to record AccessLog event:", err.message);
    return null;
  }
};
