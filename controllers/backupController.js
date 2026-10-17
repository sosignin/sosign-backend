import asyncHandler from "express-async-handler";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import BackupLog from "../models/backupLogModel.js";
import {
  createDatabaseBackup,
  verifyBackupIntegrity,
} from "../services/backupService.js";

// @desc    Get all backup logs & disaster recovery telemetry
// @route   GET /api/admin/backups
// @access  Admin
export const getBackups = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;
  const skip = (page - 1) * limit;

  const total = await BackupLog.countDocuments();
  const backups = await BackupLog.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Aggregated Disaster Recovery Stats
  const latestBackup = await BackupLog.findOne({ status: "completed" }).sort({ createdAt: -1 });
  const totalVerified = await BackupLog.countDocuments({ verified: true });
  const failedCount = await BackupLog.countDocuments({ status: "failed" });

  res.status(200).json({
    success: true,
    backups,
    stats: {
      totalBackups: total,
      latestBackupDate: latestBackup ? latestBackup.createdAt : null,
      latestBackupSize: latestBackup ? latestBackup.sizeBytes : 0,
      totalVerified,
      failedCount,
      rpoHours: 24, // Recovery Point Objective: Daily snapshot
      rtoHours: 4,  // Recovery Time Objective: Restore within 4 hours
      retentionDays: 90,
    },
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
    },
  });
});

// @desc    Trigger an immediate point-in-time backup snapshot
// @route   POST /api/admin/backups/create
// @access  Admin
export const triggerBackup = asyncHandler(async (req, res) => {
  const adminEmail = req.admin?.email || "admin@sosign.in";
  const adminName = req.admin?.name || "System Admin";

  const backupRecord = await createDatabaseBackup({
    triggeredBy: {
      type: "admin",
      adminEmail,
      adminName,
    },
  });

  res.status(201).json({
    success: true,
    message: "Point-in-time database backup created successfully.",
    backup: backupRecord,
  });
});

// @desc    Download backup archive file for offsite / cold-storage redundancy
// @route   GET /api/admin/backups/:id/download
// @access  Admin
export const downloadBackup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { backupId: id }] }
    : { backupId: id };
  const backupRecord = await BackupLog.findOne(query);

  if (!backupRecord) {
    res.status(404);
    throw new Error("Backup snapshot not found");
  }

  if (!fs.existsSync(backupRecord.filepath)) {
    res.status(404);
    throw new Error("Backup file is missing from server storage");
  }

  res.download(backupRecord.filepath, backupRecord.filename);
});

// @desc    Verify cryptographic checksum and structure of a backup snapshot
// @route   POST /api/admin/backups/:id/verify
// @access  Admin
export const verifyBackup = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const query = mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { backupId: id }] }
    : { backupId: id };
  const backupRecord = await BackupLog.findOne(query);

  if (!backupRecord) {
    res.status(404);
    throw new Error("Backup snapshot not found");
  }

  const result = await verifyBackupIntegrity(backupRecord.backupId);

  res.status(200).json({
    success: result.verified,
    result,
  });
});
