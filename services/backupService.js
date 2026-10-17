import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import BackupLog from "../models/backupLogModel.js";

// Ensure backups directory exists (stored in parent root to isolate from web app and prevent dev reloads)
const BACKUPS_DIR = path.resolve(process.cwd(), "..", "backups");
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/**
 * Generate a unique backup ID: BK-YYYYMMDD-XXXX
 */
const generateBackupId = () => {
  const dateStr = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 8);
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BK-${dateStr}-${randomSuffix}`;
};

/**
 * Execute a point-in-time database snapshot for data loss prevention (DPDP Sec 8(5))
 */
export const createDatabaseBackup = async ({
  triggeredBy = { type: "system_cron", adminEmail: "", adminName: "Automated System" },
} = {}) => {
  const backupId = generateBackupId();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `sosign-backup-${backupId}-${timestamp}.json`;
  const filepath = path.join(BACKUPS_DIR, filename);

  const retentionDays = 90;
  const retentionUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

  // Create initial in-progress record
  const backupRecord = await BackupLog.create({
    backupId,
    filename,
    filepath,
    triggeredBy,
    status: "in_progress",
    retentionUntil,
  });

  try {
    const backupData = {
      meta: {
        backupId,
        generatedAt: new Date().toISOString(),
        version: "2026.1-DPDP",
        dataFiduciary: "LEO MEO IT Solution Private Limited (SoSign)",
        statutoryStandard: "DPDP Act 2023 Section 8(5) Data Loss Prevention",
      },
      collections: {},
    };

    const collectionsToBackup = [
      "users",
      "petitions",
      "consentlogs",
      "deletionrequests",
      "deleteduserarchives",
      "wallets",
      "adminnotifications",
      "blogs",
      "faqs",
      "crowdfundingcampaigns",
      "accesslogs",
    ];

    const collectionsStats = [];
    let totalDocs = 0;

    const db = mongoose.connection.db;

    for (const collName of collectionsToBackup) {
      try {
        const coll = db.collection(collName);
        const docs = await coll.find({}).toArray();
        backupData.collections[collName] = docs;
        const count = docs.length;
        totalDocs += count;
        collectionsStats.push({ name: collName, count });
      } catch (collErr) {
        // If collection doesn't exist yet, record 0
        backupData.collections[collName] = [];
        collectionsStats.push({ name: collName, count: 0 });
      }
    }

    const jsonString = JSON.stringify(backupData, null, 2);

    // Write file to secure disk
    fs.writeFileSync(filepath, jsonString, "utf8");

    // Compute cryptographic SHA-256 integrity checksum
    const hash = crypto.createHash("sha256").update(jsonString).digest("hex");
    const stats = fs.statSync(filepath);

    backupRecord.sizeBytes = stats.size;
    backupRecord.totalDocuments = totalDocs;
    backupRecord.collectionsBackedUp = collectionsStats;
    backupRecord.checksumSha256 = hash;
    backupRecord.status = "completed";
    backupRecord.verified = true;
    backupRecord.lastVerifiedAt = new Date();
    await backupRecord.save();

    console.log(`[DPDP Backup Engine] Successfully created snapshot: ${backupId} (${(stats.size / 1024).toFixed(2)} KB, ${totalDocs} docs)`);

    return backupRecord;
  } catch (error) {
    console.error("[DPDP Backup Engine] Backup creation failed:", error);
    backupRecord.status = "failed";
    backupRecord.errorMessage = error.message;
    await backupRecord.save();
    throw error;
  }
};

/**
 * Verify cryptographic checksum & structural integrity of a backup file
 */
export const verifyBackupIntegrity = async (backupId) => {
  const backupRecord = await BackupLog.findOne({ backupId });
  if (!backupRecord) {
    throw new Error("Backup snapshot not found");
  }

  if (!fs.existsSync(backupRecord.filepath)) {
    backupRecord.verified = false;
    backupRecord.errorMessage = "Backup archive file is missing from storage";
    await backupRecord.save();
    return { verified: false, message: "Archive file not found on disk" };
  }

  try {
    const fileContent = fs.readFileSync(backupRecord.filepath, "utf8");
    const computedHash = crypto.createHash("sha256").update(fileContent).digest("hex");

    if (computedHash !== backupRecord.checksumSha256) {
      backupRecord.verified = false;
      backupRecord.errorMessage = "SHA-256 Checksum mismatch: potential file corruption detected";
      await backupRecord.save();
      return {
        verified: false,
        message: "Checksum mismatch: Integrity compromise detected",
      };
    }

    // Verify valid JSON
    const parsed = JSON.parse(fileContent);
    if (!parsed.meta || !parsed.collections) {
      backupRecord.verified = false;
      backupRecord.errorMessage = "Archive format invalid: missing headers";
      await backupRecord.save();
      return { verified: false, message: "Archive structure invalid" };
    }

    backupRecord.verified = true;
    backupRecord.lastVerifiedAt = new Date();
    backupRecord.errorMessage = "";
    await backupRecord.save();

    return {
      verified: true,
      message: "Cryptographic SHA-256 and JSON structural integrity verified successfully.",
      checksum: computedHash,
      lastVerifiedAt: backupRecord.lastVerifiedAt,
    };
  } catch (err) {
    backupRecord.verified = false;
    backupRecord.errorMessage = err.message;
    await backupRecord.save();
    return { verified: false, message: err.message };
  }
};

/**
 * Initialize automatic daily background backup scheduler
 * Runs once every 24 hours at 02:00 AM IST (or intervals)
 */
export const initBackupScheduler = () => {
  console.log("[DPDP Backup Scheduler] Initialized automatic daily snapshot scheduler (24h retention cycle).");

  // Run initial sanity check or snapshot if none exists
  setTimeout(async () => {
    try {
      const recentBackup = await BackupLog.findOne({
        status: "completed",
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (!recentBackup) {
        console.log("[DPDP Backup Scheduler] No snapshot found for last 24h. Triggering automated daily backup...");
        await createDatabaseBackup({
          triggeredBy: {
            type: "system_cron",
            adminEmail: "system@sosign.in",
            adminName: "Automated Daily DPDP Scheduler",
          },
        });
      }
    } catch (err) {
      console.debug("[DPDP Backup Scheduler] Initial snapshot check notice:", err.message);
    }
  }, 10000); // 10 seconds after server boot

  // Periodic interval: Check every 6 hours
  setInterval(async () => {
    try {
      const recentBackup = await BackupLog.findOne({
        status: "completed",
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (!recentBackup) {
        console.log("[DPDP Backup Scheduler] Running scheduled daily backup...");
        await createDatabaseBackup({
          triggeredBy: {
            type: "system_cron",
            adminEmail: "system@sosign.in",
            adminName: "Automated Daily DPDP Scheduler",
          },
        });
      }
    } catch (err) {
      console.error("[DPDP Backup Scheduler] Scheduled backup failed:", err);
    }
  }, 6 * 60 * 60 * 1000);
};
