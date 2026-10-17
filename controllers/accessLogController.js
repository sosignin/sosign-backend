import asyncHandler from "express-async-handler";
import AccessLog from "../models/accessLogModel.js";

// @desc    Get paginated access logs with security filters
// @route   GET /api/admin/access-logs
// @access  Admin
export const getAccessLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const { search, severity, actorType, statusCode, action } = req.query;

  const query = {};

  if (severity && severity !== "all") {
    query.severity = severity;
  }

  if (actorType && actorType !== "all") {
    query.actorType = actorType;
  }

  if (action && action !== "all") {
    query.action = action;
  }

  if (statusCode && statusCode !== "all") {
    query.statusCode = parseInt(statusCode, 10);
  }

  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { actorEmail: { $regex: s, $options: "i" } },
      { actorName: { $regex: s, $options: "i" } },
      { ipAddress: { $regex: s, $options: "i" } },
      { action: { $regex: s, $options: "i" } },
      { resource: { $regex: s, $options: "i" } },
    ];
  }

  const total = await AccessLog.countDocuments(query);
  const logs = await AccessLog.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    logs,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    },
  });
});

// @desc    Get access log security monitoring stats & real-time telemetry
// @route   GET /api/admin/access-logs/stats
// @access  Admin
export const getAccessLogStats = asyncHandler(async (req, res) => {
  const totalEvents = await AccessLog.countDocuments();

  // Last 24 hours timestamp
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const eventsLast24h = await AccessLog.countDocuments({
    createdAt: { $gte: last24h },
  });

  const highSeverityCount = await AccessLog.countDocuments({
    severity: { $in: ["high", "critical"] },
  });

  const failedAuthCount = await AccessLog.countDocuments({
    statusCode: { $in: [401, 403] },
  });

  const adminActionsCount = await AccessLog.countDocuments({
    actorType: "admin",
  });

  // Top 5 active client IP addresses
  const topIps = await AccessLog.aggregate([
    { $match: { createdAt: { $gte: last24h } } },
    { $group: { _id: "$ipAddress", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  // Recent 5 security incidents
  const recentAlerts = await AccessLog.find({
    severity: { $in: ["high", "critical"] },
  })
    .sort({ createdAt: -1 })
    .limit(5);

  res.status(200).json({
    success: true,
    stats: {
      totalEvents,
      eventsLast24h,
      highSeverityCount,
      failedAuthCount,
      adminActionsCount,
      topIps,
      recentAlerts,
    },
  });
});

// @desc    Export access logs for CERT-In & DPDP regulatory audits
// @route   GET /api/admin/access-logs/export
// @access  Admin
export const exportAccessLogs = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 5000;
  const logs = await AccessLog.find()
    .sort({ createdAt: -1 })
    .limit(limit);

  res.status(200).json({
    success: true,
    exportMeta: {
      generatedAt: new Date().toISOString(),
      statutoryCompliance: "DPDP Act 2023 Sec 8(5) & CERT-In Access Logging Directive",
      totalRecords: logs.length,
      retentionPolicy: "180 Days",
      dataFiduciary: "LEO MEO IT Solution Private Limited (SoSign)",
    },
    logs,
  });
});
