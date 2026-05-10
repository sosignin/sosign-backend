import multer from "multer";

// Memory storage – we need raw buffers to forward to PlanAPI, not Cloudinary
const storage = multer.memoryStorage();

const aadhaarKycUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed for Aadhaar KYC!"), false);
    }
  },
});

export default aadhaarKycUpload;
