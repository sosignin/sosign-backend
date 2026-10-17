import { logAccessEvent } from "../utils/accessLogger.js";

/**
 * Access Logging Middleware
 * Intercepts requests to sensitive routes, measures duration, and logs access for DPDP & CERT-In compliance
 */
export const accessLogMiddleware = (req, res, next) => {
  const startTime = Date.now();

  // Determine if this route is sensitive and should be logged
  const url = req.originalUrl || req.url;

  // Filter out static assets or noisy endpoints (health checks, traffic ping)
  if (
    url.startsWith("/_next") ||
    url.startsWith("/static") ||
    url === "/health" ||
    url.includes("/api/traffic")
  ) {
    return next();
  }

  // Hook into response finish event to capture status code & execution time
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Detect action category
    let action = "api_access";
    let severity = "low";

    if (url.includes("/api/admin/login")) {
      action = statusCode === 200 ? "admin_login_success" : "admin_login_failed";
      severity = statusCode === 200 ? "medium" : "high";
    } else if (url.includes("/api/users/login")) {
      action = statusCode === 200 ? "user_login_success" : "user_login_failed";
      severity = statusCode === 200 ? "low" : "medium";
    } else if (url.includes("/api/users/profile") || url.includes("/api/users/me")) {
      action = req.method === "GET" ? "read_personal_profile" : "update_personal_profile";
    } else if (url.includes("/api/aadhaar") || url.includes("/api/pan") || url.includes("/api/voter")) {
      action = "statutory_kyc_verification";
      severity = "medium";
    } else if (url.includes("/api/deletion-requests")) {
      action = req.method === "POST" ? "request_data_deletion" : "admin_manage_deletion";
      severity = "high";
    } else if (url.includes("/api/consent/admin/export") || url.includes("/api/admin/access-logs/export")) {
      action = "statutory_data_export";
      severity = "high";
    } else if (url.includes("/api/admin/backups")) {
      action = req.method === "POST" ? "backup_snapshot_create" : "backup_archive_inspect";
      severity = "high";
    } else if (url.startsWith("/api/admin")) {
      action = `admin_${req.method.toLowerCase()}_action`;
      severity = req.method !== "GET" ? "medium" : "low";
    } else if (url.includes("/api/consent")) {
      action = "consent_management";
    }

    if (statusCode === 401 || statusCode === 403) {
      action = "unauthorized_access_attempt";
      severity = "high";
    }

    // Only log if it's an admin operation, an auth action, a personal data access, or a security error (401/403/500)
    const shouldLog =
      url.startsWith("/api/admin") ||
      url.includes("/api/users/login") ||
      url.includes("/api/users/profile") ||
      url.includes("/api/users/me") ||
      url.includes("/api/aadhaar") ||
      url.includes("/api/pan") ||
      url.includes("/api/voter") ||
      url.includes("/api/deletion-requests") ||
      url.includes("/api/consent") ||
      statusCode === 401 ||
      statusCode === 403 ||
      statusCode >= 500;

    if (shouldLog) {
      logAccessEvent({
        req,
        action,
        resource: url,
        method: req.method,
        statusCode,
        durationMs,
        severity,
      });
    }
  });

  next();
};
