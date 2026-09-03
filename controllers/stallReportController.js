import asyncHandler from "express-async-handler";
import School from "../models/schoolModel.js";
import StallReport from "../models/stallReportModel.js";
import Petition from "../models/petitionModel.js";
import createAdminNotification from "../utils/adminNotifier.js";

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

// Seed schools & deduplicate approved seed records
async function ensureSchoolsSeeded() {
  for (const s of INITIAL_MAHARASHTRA_SCHOOLS) {
    const exists = await School.findOne({
      name: { $regex: new RegExp(`^${s.name.trim()}$`, "i") },
      city: { $regex: new RegExp(`^${s.city.trim()}$`, "i") },
    });

    if (!exists) {
      await School.create({
        name: s.name.trim(),
        city: s.city.trim(),
        state: "Maharashtra",
        address: s.address,
        location: {
          type: "Point",
          coordinates: s.coordinates,
        },
        status: "approved",
        isApproved: true,
      });
    }
  }

  // Only remove duplicates from approved seed schools, never touch pending user requests
  const approvedSchools = await School.find({ status: "approved" });
  const seenKeys = new Set();
  const duplicateIds = [];

  for (const item of approvedSchools) {
    const key = `${item.name.toLowerCase().trim()}_${item.city.toLowerCase().trim()}`;
    if (seenKeys.has(key)) {
      duplicateIds.push(item._id);
    } else {
      seenKeys.add(key);
    }
  }

  if (duplicateIds.length > 0) {
    await School.deleteMany({ _id: { $in: duplicateIds } });
  }
}

// @desc    Get Maharashtra cities
// @route   GET /api/stall-reports/cities
// @access  Public
export const getCities = asyncHandler(async (req, res) => {
  await ensureSchoolsSeeded();
  const filter = { state: "Maharashtra", $or: [{ isApproved: true }, { status: "approved" }, { isApproved: { $exists: false } }] };
  const cities = await School.distinct("city", filter);
  res.status(200).json({ cities: cities.sort() });
});

// @desc    Get schools by city
// @route   GET /api/stall-reports/schools
// @access  Public
export const getSchoolsByCity = asyncHandler(async (req, res) => {
  await ensureSchoolsSeeded();
  const { city } = req.query;
  const filter = { state: "Maharashtra", $or: [{ isApproved: true }, { status: "approved" }, { isApproved: { $exists: false } }] };
  if (city) {
    filter.city = { $regex: new RegExp(`^${city.trim()}$`, "i") };
  }

  const rawSchools = await School.find(filter).sort({ name: 1 });

  // Deduplicate by lowercased name + city
  const uniqueSchools = [];
  const seenKeys = new Set();
  for (const s of rawSchools) {
    const key = `${s.name.toLowerCase().trim()}_${s.city.toLowerCase().trim()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSchools.push(s);
    }
  }

  res.status(200).json({ schools: uniqueSchools });
});

// @desc    Submit a junk food stall report (Signers only)
// @route   POST /api/stall-reports
// @access  Private (Signer)
export const createStallReport = asyncHandler(async (req, res) => {
  const {
    petitionId,
    city,
    district,
    taluka,
    villageTown,
    landmark,
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

  // Check if user has signed the petition or is the petition creator
  const isCreator = petition.user && petition.user.toString() === req.user._id.toString();
  const hasSigned = petition.signatures.some(
    (sig) => sig.user.toString() === req.user._id.toString()
  );

  if (!hasSigned && !isCreator) {
    res.status(403);
    throw new Error("Only users who have signed this petition or the petition creator can submit a junk food stall report.");
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

  // Generate unique human-readable Grievance ID e.g. GRV-MH-8492
  const randomCode = Math.floor(1000 + Math.random() * 9000);
  const grievanceId = `GRV-MH-${Date.now().toString().slice(-4)}${randomCode}`;

  const stallReport = await StallReport.create({
    petitionId,
    userId: req.user._id,
    city: city || district || school.city,
    district: district || city || school.city,
    taluka: taluka || "",
    villageTown: villageTown || "",
    landmark: landmark || "",
    grievanceId,
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

  // Trigger Admin Notification
  createAdminNotification({
    category: "stall_report",
    title: "New Stall Report 🚨",
    message: `Citizen reported "${shopName}" within ${distanceFromSchoolMeters}m of ${school.name}, ${stallReport.city} (${grievanceId})`,
    link: "/dashboard/stall-reports",
    relatedId: stallReport._id,
    meta: {
      shopName,
      schoolName: school.name,
      city: stallReport.city,
      distance: distanceFromSchoolMeters,
      grievanceId,
    },
  });

  res.status(201).json({
    message: "Report submitted successfully! It will be visible once approved by admin.",
    report: stallReport,
  });
});

// @desc    Get logged-in citizen's submitted reports / complaints dashboard
// @route   GET /api/stall-reports/my-reports
// @access  Private
export const getUserStallReports = asyncHandler(async (req, res) => {
  const reports = await StallReport.find({ userId: req.user._id })
    .populate("schoolId", "name city address location")
    .populate("petitionId", "title slug")
    .sort({ createdAt: -1 });

  res.status(200).json({ reports });
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

// @desc    Signer: Submit a request for missing city & school
// @route   POST /api/stall-reports/schools/request
// @access  Private (Signer)
export const requestNewSchool = asyncHandler(async (req, res) => {
  const { name, city, address, latitude, longitude } = req.body;

  if (!name || !city) {
    res.status(400);
    throw new Error("Please provide school name and city.");
  }

  const defaultCoords = [75.7139, 19.7515]; // Default Maharashtra center
  let shopLat = latitude ? parseFloat(latitude) : defaultCoords[1];
  let shopLng = longitude ? parseFloat(longitude) : defaultCoords[0];

  if (isNaN(shopLat)) shopLat = defaultCoords[1];
  if (isNaN(shopLng)) shopLng = defaultCoords[0];

  const newSchool = await School.create({
    name: name.trim(),
    city: city.trim(),
    state: "Maharashtra",
    address: address ? address.trim() : city.trim(),
    location: {
      type: "Point",
      coordinates: [shopLng, shopLat],
    },
    status: "pending",
    isApproved: false,
    requestedBy: req.user?._id,
  });

  // Trigger Admin Notification
  createAdminNotification({
    category: "school_request",
    title: "New School Request 🏫",
    message: `Citizen requested addition of school "${newSchool.name}" in ${newSchool.city}`,
    link: "/dashboard/school-requests",
    relatedId: newSchool._id,
    meta: {
      schoolName: newSchool.name,
      city: newSchool.city,
      requestedBy: req.user?.name,
    },
  });

  res.status(201).json({
    message: "School and city request submitted successfully. Admin will review and approve.",
    school: newSchool,
  });
});

// @desc    Admin: Get pending school & city requests
// @route   GET /api/stall-reports/admin/school-requests
// @access  Admin
export const getPendingSchoolRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status && status !== "all") {
    filter.status = status;
  } else if (!status) {
    filter.status = "pending";
  }

  const schools = await School.find(filter)
    .populate("requestedBy", "name email mobileNumber")
    .sort({ createdAt: -1 });

  res.status(200).json({ schools });
});

// @desc    Admin: Approve school & city request (with optional location/details update)
// @route   PUT /api/stall-reports/admin/school-requests/:id/approve
// @access  Admin
export const approveSchoolRequest = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) {
    res.status(404);
    throw new Error("School request not found");
  }

  const { name, city, address, latitude, longitude } = req.body || {};

  if (name && name.trim()) school.name = name.trim();
  if (city && city.trim()) school.city = city.trim();
  if (address !== undefined) school.address = address.trim();

  if (latitude !== undefined && longitude !== undefined) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      school.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }
  }

  school.status = "approved";
  school.isApproved = true;
  await school.save();

  res.status(200).json({ message: "School and city request approved successfully!", school });
});

// @desc    Admin: Update school details & exact GPS coordinates
// @route   PUT /api/stall-reports/admin/school-requests/:id
// @access  Admin
export const updateSchoolRequest = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) {
    res.status(404);
    throw new Error("School request not found");
  }

  const { name, city, address, latitude, longitude, status } = req.body || {};

  if (name && name.trim()) school.name = name.trim();
  if (city && city.trim()) school.city = city.trim();
  if (address !== undefined) school.address = address.trim();

  if (latitude !== undefined && longitude !== undefined) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      school.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }
  }

  if (status && ["approved", "pending", "rejected"].includes(status)) {
    school.status = status;
    school.isApproved = status === "approved";
  }

  await school.save();

  res.status(200).json({ message: "School details and exact location updated successfully!", school });
});

// @desc    Admin: Reject school & city request
// @route   PUT /api/stall-reports/admin/school-requests/:id/reject
// @access  Admin
export const rejectSchoolRequest = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) {
    res.status(404);
    throw new Error("School request not found");
  }

  school.status = "rejected";
  school.isApproved = false;
  await school.save();

  res.status(200).json({ message: "School request rejected successfully!", school });
});

// @desc    Public / Vendor: Submit a defense/dispute request for a reported stall
// @route   POST /api/stall-reports/:id/defend
// @access  Public
export const submitStallDefense = asyncHandler(async (req, res) => {
  const { vendorName, vendorContact, reason, explanation, newGoogleMapsUrl } = req.body;

  if (!vendorName || !reason || !explanation) {
    res.status(400);
    throw new Error("Please provide vendor name, reason, and explanation.");
  }

  const report = await StallReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found.");
  }

  if (!report.defenses) {
    report.defenses = [];
  }

  report.defenses.push({
    vendorName: vendorName.trim(),
    vendorContact: vendorContact ? vendorContact.trim() : "",
    reason,
    explanation: explanation.trim(),
    newGoogleMapsUrl: newGoogleMapsUrl ? newGoogleMapsUrl.trim() : "",
    status: "pending",
    submittedAt: new Date(),
  });

  await report.save();

  // Trigger Admin Notification
  createAdminNotification({
    category: "stall_dispute",
    title: "New Stall Dispute Defense 🛡️",
    message: `Vendor "${vendorName}" submitted a dispute defense for stall "${report.shopName}" (${report.grievanceId || report.city})`,
    link: "/dashboard/stall-disputes",
    relatedId: report._id,
    meta: {
      vendorName,
      shopName: report.shopName,
      grievanceId: report.grievanceId,
      reason,
    },
  });

  res.status(201).json({
    message: "Your defense/dispute request has been submitted successfully to the admin for review.",
    report,
  });
});

// @desc    Admin: Get all stall reports with vendor defenses/disputes
// @route   GET /api/stall-reports/admin/disputes
// @access  Admin
export const getStallDisputes = asyncHandler(async (req, res) => {
  const reports = await StallReport.find({ "defenses.0": { $exists: true } })
    .populate("schoolId", "name city address")
    .sort({ updatedAt: -1 });

  res.status(200).json({ reports });
});

// @desc    Admin: Resolve or Dismiss a vendor defense/dispute
// @route   PUT /api/stall-reports/admin/disputes/:reportId/:defenseId/resolve
// @access  Admin
export const resolveStallDispute = asyncHandler(async (req, res) => {
  const { action, adminNotes } = req.body; // action: 'approve_resolve' or 'dismiss'
  const { reportId, defenseId } = req.params;

  const report = await StallReport.findById(reportId);
  if (!report) {
    res.status(404);
    throw new Error("Stall report not found.");
  }

  const defense = report.defenses.id(defenseId);
  if (!defense) {
    res.status(404);
    throw new Error("Defense request not found.");
  }

  if (action === "approve_resolve") {
    defense.status = "approved_resolved";
    // Mark the stall report as rejected / resolved so it is no longer flagged as an active violation on map
    report.status = "rejected";
    report.rejectionReason = `Resolved via Vendor Defense: ${defense.reason} - ${adminNotes || "Stall shifted or >50m away"}`;
  } else {
    defense.status = "reviewed_dismissed";
  }

  await report.save();

  res.status(200).json({ message: `Vendor dispute ${action === "approve_resolve" ? "approved & stall report resolved" : "dismissed"}.`, report });
});
