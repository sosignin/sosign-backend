import asyncHandler from "express-async-handler";
import School from "../models/schoolModel.js";
import StallReport from "../models/stallReportModel.js";
import Petition from "../models/petitionModel.js";

// Helper: Haversine Geodesic Distance in Meters
function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Initial seed data for Maharashtra Cities & Schools
const INITIAL_MAHARASHTRA_SCHOOLS = [
  { name: "Bombay Scottish School", city: "Mumbai", address: "Mahim, Mumbai", coordinates: [72.8398, 19.0345] },
  { name: "St. Xavier's High School", city: "Mumbai", address: "Fort, Mumbai", coordinates: [72.8335, 18.9438] },
  { name: "Dhirubhai Ambani International School", city: "Mumbai", address: "BKC, Mumbai", coordinates: [72.8682, 19.0652] },
  { name: "Cathedral & John Connon School", city: "Mumbai", address: "Fort, Mumbai", coordinates: [72.8322, 18.9378] },
  { name: "Don Bosco High School", city: "Mumbai", address: "Matunga, Mumbai", coordinates: [72.8546, 19.0267] },

  { name: "Loyola High School", city: "Pune", address: "Pashan, Pune", coordinates: [73.8188, 18.5392] },
  { name: "St. Vincent's High School", city: "Pune", address: "Camp, Pune", coordinates: [73.8765, 18.5134] },
  { name: "The Bishop's School", city: "Pune", address: "Camp, Pune", coordinates: [73.8741, 18.5121] },
  { name: "Fergusson Junior College & School", city: "Pune", address: "FC Road, Pune", coordinates: [73.8398, 18.5228] },

  { name: "Smt. Sulochanadevi Singhania School", city: "Thane", address: "Jekegram, Thane West", coordinates: [72.9642, 19.2065] },
  { name: "Hiranandani Foundation School", city: "Thane", address: "Ghodbunder Road, Thane", coordinates: [72.9781, 19.2482] },

  { name: "Centre Point School", city: "Nagpur", address: "Wardhaman Nagar, Nagpur", coordinates: [79.1198, 21.1492] },
  { name: "St. John's High School", city: "Nagpur", address: "Mohan Nagar, Nagpur", coordinates: [79.0834, 21.1612] },

  { name: "Barnes School & Junior College", city: "Nashik", address: "Devlali, Nashik", coordinates: [73.8321, 19.9543] },
  { name: "K.K. Wagh Universal School", city: "Nashik", address: "Panchavati, Nashik", coordinates: [73.8156, 20.0123] },

  { name: "Stepping Stones High School", city: "Chhatrapati Sambhajinagar", address: "Beed Bypass, Sambhajinagar", coordinates: [75.3482, 19.8654] },
  { name: "Jain International School", city: "Solapur", address: "NH-9, Solapur", coordinates: [75.9064, 17.6599] },
];

// Seed schools if empty
async function ensureSchoolsSeeded() {
  const count = await School.countDocuments();
  if (count === 0) {
    const docs = INITIAL_MAHARASHTRA_SCHOOLS.map(s => ({
      name: s.name,
      city: s.city,
      state: "Maharashtra",
      address: s.address,
      location: {
        type: "Point",
        coordinates: s.coordinates
      }
    }));
    await School.insertMany(docs);
  }
}

// @desc    Get Maharashtra cities
// @route   GET /api/stall-reports/cities
// @access  Public
export const getCities = asyncHandler(async (req, res) => {
  await ensureSchoolsSeeded();
  const cities = await School.distinct("city", { state: "Maharashtra" });
  res.status(200).json({ cities: cities.sort() });
});

// @desc    Get schools by city
// @route   GET /api/stall-reports/schools
// @access  Public
export const getSchoolsByCity = asyncHandler(async (req, res) => {
  await ensureSchoolsSeeded();
  const { city } = req.query;
  const filter = { state: "Maharashtra" };
  if (city) {
    filter.city = { $regex: new RegExp(`^${city.trim()}$`, "i") };
  }

  const schools = await School.find(filter).sort({ name: 1 });
  res.status(200).json({ schools });
});

// @desc    Submit a junk food stall report (Signers only)
// @route   POST /api/stall-reports
// @access  Private (Signer)
export const createStallReport = asyncHandler(async (req, res) => {
  const {
    petitionId,
    city,
    schoolId,
    shopName,
    description,
    latitude,
    longitude,
  } = req.body;

  // Get image URLs from uploaded files (Cloudinary) or fallback to body URLs
  const uploadedImages = req.files ? req.files.map((f) => f.path) : [];
  const bodyImages = req.body.images ? (Array.isArray(req.body.images) ? req.body.images : [req.body.images]) : [];
  const images = uploadedImages.length > 0 ? uploadedImages : bodyImages;

  if (!petitionId || !schoolId || !shopName || !latitude || !longitude) {
    res.status(400);
    throw new Error("Please provide petition, school, shop name, and GPS coordinates.");
  }

  const petition = await Petition.findById(petitionId);
  if (!petition) {
    res.status(404);
    throw new Error("Petition not found");
  }

  // Check if user has signed the petition
  const hasSigned = petition.signatures.some(
    (sig) => sig.user.toString() === req.user._id.toString()
  );

  if (!hasSigned) {
    res.status(403);
    throw new Error("Only users who have signed this petition can submit a junk food stall report.");
  }

  const school = await School.findById(schoolId);
  if (!school) {
    res.status(404);
    throw new Error("Selected school not found");
  }

  const shopLat = parseFloat(latitude);
  const shopLng = parseFloat(longitude);
  const schoolLng = school.location.coordinates[0];
  const schoolLat = school.location.coordinates[1];

  const distanceFromSchoolMeters = calculateDistanceInMeters(
    schoolLat,
    schoolLng,
    shopLat,
    shopLng
  );

  const stallReport = await StallReport.create({
    petitionId,
    userId: req.user._id,
    city: city || school.city,
    schoolId,
    shopName,
    description,
    images: Array.isArray(images) ? images : [],
    location: {
      type: "Point",
      coordinates: [shopLng, shopLat],
    },
    distanceFromSchoolMeters,
    status: "pending",
  });

  res.status(201).json({
    message: "Report submitted successfully! It will be visible once approved by admin.",
    report: stallReport,
  });
});

// @desc    Get approved reports for a petition (and optional city)
// @route   GET /api/stall-reports/approved/:petitionId
// @access  Public
export const getApprovedStallReports = asyncHandler(async (req, res) => {
  const { petitionId } = req.params;
  const { city } = req.query;

  const query = {
    petitionId,
    status: "approved",
  };

  if (city) {
    query.city = { $regex: new RegExp(`^${city.trim()}$`, "i") };
  }

  const reports = await StallReport.find(query)
    .populate("schoolId", "name city address location")
    .populate("userId", "name email profilePicture")
    .sort({ createdAt: -1 });

  res.status(200).json({ reports });
});

// @desc    Admin: Get all stall reports (filterable by status)
// @route   GET /api/stall-reports/admin/reports
// @access  Admin
export const getAdminStallReports = asyncHandler(async (req, res) => {
  const { status, city } = req.query;
  const query = {};

  if (status) query.status = status;
  if (city) query.city = { $regex: new RegExp(`^${city.trim()}$`, "i") };

  const reports = await StallReport.find(query)
    .populate("petitionId", "title slug")
    .populate("schoolId", "name city address location")
    .populate("userId", "name email mobileNumber")
    .sort({ createdAt: -1 });

  res.status(200).json({ reports });
});

// @desc    Admin: Approve stall report
// @route   PUT /api/stall-reports/admin/:id/approve
// @access  Admin
export const approveStallReport = asyncHandler(async (req, res) => {
  const report = await StallReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found");
  }

  report.status = "approved";
  await report.save();

  res.status(200).json({ message: "Stall report approved successfully", report });
});

// @desc    Admin: Reject stall report
// @route   PUT /api/stall-reports/admin/:id/reject
// @access  Admin
export const rejectStallReport = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const report = await StallReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found");
  }

  report.status = "rejected";
  report.rejectionReason = reason || "Invalid report or insufficient evidence.";
  await report.save();

  res.status(200).json({ message: "Stall report rejected", report });
});
