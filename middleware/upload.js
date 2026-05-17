import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "petition-images",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [
      { width: 1200, height: 800, crop: "limit" },
      { quality: "auto:good" },
    ],
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Storage for progress updates (supports images and documents/PDFs)
const progressStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Determine folder and resource type based on file mimetype
    if (file.mimetype === "application/pdf") {
      return {
        folder: "progress-documents",
        format: "pdf",
        resource_type: "raw", // PDFs and other non-image files must be uploaded as raw or auto in Cloudinary
      };
    } else {
      return {
        folder: "progress-images",
        allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
        transformation: [
          { width: 1200, height: 800, crop: "limit" },
          { quality: "auto:good" },
        ],
      };
    }
  },
});

const uploadProgressFiles = multer({
  storage: progressStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for documents, images should ideally be smaller
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/pdf"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image and PDF files are allowed!"), false);
    }
  },
});

export { uploadProgressFiles };
export default upload;
