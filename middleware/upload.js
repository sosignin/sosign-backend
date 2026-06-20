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

// Storage for progress update images (CloudinaryStorage handles images fine)
const progressImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "progress-images",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [
      { width: 1200, height: 800, crop: "limit" },
      { quality: "auto:good" },
    ],
  },
});

// Use memory storage so we can handle PDFs manually via Cloudinary upload_stream
const progressMemoryStorage = multer.memoryStorage();

const uploadProgressFiles = multer({
  storage: progressMemoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
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

// Helper: upload a single buffer to Cloudinary
const uploadToCloudinary = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
};

// Middleware to process uploaded files: upload images and PDFs to Cloudinary
const processProgressFiles = async (req, res, next) => {
  try {
    // If no files were uploaded (e.g. text or video updates), skip processing
    if (!req.files || Object.keys(req.files).length === 0) return next();

    const imageFiles = req.files.images || [];
    const docFiles = req.files.documents || [];

    // If no actual files in any field, skip
    if (imageFiles.length === 0 && docFiles.length === 0) return next();

    const processedFiles = { images: [], documents: [] };

    // Process image files
    for (const file of imageFiles) {
      if (!file.buffer) continue;
      const result = await uploadToCloudinary(file.buffer, {
        folder: "progress-images",
        resource_type: "image",
        transformation: [
          { width: 1200, height: 800, crop: "limit" },
          { quality: "auto:good" },
        ],
      });
      processedFiles.images.push({
        ...file,
        path: result.secure_url,
        filename: result.public_id,
      });
    }

    // Process PDF documents
    for (const file of docFiles) {
      if (!file.buffer) continue;
      const result = await uploadToCloudinary(file.buffer, {
        folder: "progress-documents",
        resource_type: "raw",
      });
      processedFiles.documents.push({
        ...file,
        path: result.secure_url,
        filename: file.originalname,
      });
    }

    // Replace req.files with processed files (same shape the controller expects)
    req.files = processedFiles;
    next();
  } catch (error) {
    console.error("Error processing progress files:", error);
    next(error);
  }
};

export { uploadProgressFiles, processProgressFiles };
export default upload;

