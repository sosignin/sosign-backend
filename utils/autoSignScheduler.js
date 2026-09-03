import AutoSignSchedule from "../models/autoSignScheduleModel.js";
import Petition from "../models/petitionModel.js";
import User from "../models/userModel.js";

const firstNames = [
  "Amit", "Rahul", "Priya", "Sneha", "Rajesh", "Vikram", "Neha", "Anjali",
  "Sanjay", "Deepak", "Aarav", "Vihaan", "Aditya", "Sai", "Ishaan", "Arjun",
  "Kabir", "Rohan", "Meera", "Kavya", "Diya", "Riya", "Aanya", "Prisha",
  "Sunil", "Pooja", "Gaurav", "Simran", "Karan", "Tanvi", "Nikhil", "Shreya"
];

const lastNames = [
  "Sharma", "Kumar", "Singh", "Patel", "Mehta", "Joshi", "Verma", "Gupta",
  "Nair", "Iyer", "Reddy", "Rao", "Haldar", "Choudhury", "Das", "Banerjee",
  "Sen", "Roy", "Shah", "Deshmukh", "Kulkarni", "Patil", "Bose", "Mishra"
];

const emailDomains = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "protonmail.com",
  "rediffmail.com", "zoho.com", "icloud.com", "mail.com", "yandex.com",
  "aol.com", "fastmail.com", "tutanota.com", "inbox.com", "live.com"
];

/**
 * Injects a specified number of dummy signatures into a petition.
 */
export const injectSignaturesIntoPetition = async (petitionId, count, useSameMobile = "9999990000") => {
  const petition = await Petition.findById(petitionId);
  if (!petition) {
    throw new Error(`Petition ${petitionId} not found`);
  }

  const signaturesToAdd = [];

  for (let i = 0; i < count; i++) {
    const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const name = `${fName} ${lName}`;

    const uniqueSuffix = Math.floor(100000 + Math.random() * 900000);
    const randomDomain = emailDomains[Math.floor(Math.random() * emailDomains.length)];
    const cleanName = `${fName}${lName}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const email = `${cleanName}${uniqueSuffix}@${randomDomain}`;

    const dummyUser = await User.create({
      name,
      email,
      mobileNumber: useSameMobile,
      designation: "Supporter",
      bio: "Citizen supporter",
      password: "dummy_password_12345",
      aadhaarKyc: {
        status: "verified",
        maskedAadhaar: "XXXX-XXXX-" + Math.floor(1000 + Math.random() * 9000),
        name,
        dob: "01/01/1990",
        address: "SoSign Hub, India",
        state: "Delhi",
        pincode: "110001",
        verifiedAt: new Date(),
      },
    });

    signaturesToAdd.push({
      user: dummyUser._id,
      signedAt: new Date(),
    });
  }

  petition.signatures.push(...signaturesToAdd);
  petition.numberOfSignatures = (petition.numberOfSignatures || 0) + count;
  await petition.save();

  return {
    added: count,
    newTotal: petition.numberOfSignatures,
  };
};

let isSchedulerRunning = false;
let schedulerIntervalId = null;

/**
 * Worker process that scans for due auto-sign schedules and executes signature batches.
 */
export const processDueSchedules = async () => {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;

  try {
    const now = new Date();
    // Find running schedules that are due
    const dueSchedules = await AutoSignSchedule.find({
      status: "running",
      nextRunAt: { $lte: now },
    });

    for (const schedule of dueSchedules) {
      try {
        const remaining = schedule.totalSignaturesTarget - schedule.signaturesAdded;

        // If target already reached, mark completed
        if (remaining <= 0) {
          schedule.status = "completed";
          schedule.nextRunAt = null;
          await schedule.save();
          continue;
        }

        // Determine how many signatures to add in this batch
        let countToAdd = Math.min(schedule.batchSize, remaining);

        // Apply natural random jitter if enabled
        if (schedule.randomJitter && countToAdd > 1 && remaining > 1) {
          // Variance: e.g. batch size of 5 could be 4, 5, or 6
          const variance = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
          countToAdd = Math.max(1, Math.min(remaining, countToAdd + variance));
        }

        // Inject signatures into target petition
        const result = await injectSignaturesIntoPetition(
          schedule.petition,
          countToAdd,
          schedule.useSameMobile || "9999990000"
        );

        // Update schedule progress
        schedule.signaturesAdded += countToAdd;
        schedule.lastRunAt = new Date();

        // Add log entry (keep last 50 logs)
        if (!schedule.logs) schedule.logs = [];
        schedule.logs.unshift({
          addedCount: countToAdd,
          timestamp: new Date(),
          currentTotal: schedule.signaturesAdded,
          petitionSignatureCount: result.newTotal,
          note: `Added ${countToAdd} signatures. Progress: ${schedule.signaturesAdded}/${schedule.totalSignaturesTarget}`,
        });
        if (schedule.logs.length > 50) {
          schedule.logs = schedule.logs.slice(0, 50);
        }

        // Check if finished
        if (schedule.signaturesAdded >= schedule.totalSignaturesTarget) {
          schedule.status = "completed";
          schedule.nextRunAt = null;
        } else {
          // Schedule next batch
          const intervalMs = (schedule.intervalSeconds || 300) * 1000;
          schedule.nextRunAt = new Date(Date.now() + intervalMs);
        }

        await schedule.save();
        console.log(`[AutoSign] Injected ${countToAdd} signatures for petition ${schedule.petition}. Total added: ${schedule.signaturesAdded}/${schedule.totalSignaturesTarget}`);
      } catch (scheduleError) {
        console.error(`[AutoSign] Error executing schedule ${schedule._id}:`, scheduleError);
        schedule.errorMessage = scheduleError.message || "Failed to inject signatures";
        // Backoff retry in 30 seconds
        schedule.nextRunAt = new Date(Date.now() + 30000);
        await schedule.save().catch(() => {});
      }
    }
  } catch (error) {
    console.error("[AutoSign] Scheduler tick error:", error);
  } finally {
    isSchedulerRunning = false;
  }
};

/**
 * Initializes the background scheduler.
 */
export const initAutoSignScheduler = () => {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
  }

  // Run every 5 seconds
  schedulerIntervalId = setInterval(processDueSchedules, 5000);

  // Run first check after 3 seconds
  setTimeout(processDueSchedules, 3000);

  console.log("🚀 Auto-Sign Interval Scheduler initialized (5s heartbeat)");
};
