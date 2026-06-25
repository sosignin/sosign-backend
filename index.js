import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

// Config
import connectDB from "./config/db.js";

// Routes
import userRoutes from "./routes/userRoutes.js";
import petitionRoutes from "./routes/petitionRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import successfulPetitionRoutes from "./routes/successfulPetitionRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adsRoutes from "./routes/adsRoutes.js";
import downloadRequestRoutes from "./routes/downloadRequestRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import hideRequestRoutes from "./routes/hideRequestRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import captchaRoutes from "./routes/captchaRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import walletRequestRoutes from "./routes/walletRequestRoutes.js";
import aadhaarRoutes from "./routes/aadhaarRoutes.js";
import subAdminRoutes from "./routes/subAdminRoutes.js";
import otpRoutes from "./routes/otpRoutes.js";
import crowdfundingRoutes from "./routes/crowdfundingRoutes.js";
import withdrawalRoutes from "./routes/withdrawalRoutes.js";
import panRoutes from "./routes/panRoutes.js";
import voterRoutes from "./routes/voterRoutes.js";
import progressUpdateRoutes from "./routes/progressUpdateRoutes.js";
import planRoutes from "./routes/planRoutes.js";


// Middleware
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

// Models (for seeding)
import Category from "./models/categoryModel.js";
import Plan from "./models/planModel.js";

// Load environment variables
dotenv.config();

// Connect to database and seed default data
connectDB().then(async () => {
  // Seed default categories
  try {
    await Category.seedDefaults();
  } catch (error) {
    console.error("Error seeding categories:", error.message);
  }
  // Seed default plans
  try {
    await Plan.seedDefaults();
  } catch (error) {
    console.error("Error seeding plans:", error.message);
  }
});

const app = express();

// Trust proxy for rate limiting behind reverse proxies
app.set("trust proxy", 1);

// CORS configuration - MUST be before helmet and other middleware
const allowedOrigins =
  process.env.ALLOWED_ORIGINS ?
    process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "https://sosign.vercel.app",
      "https://sosign-admin.vercel.app",
      "https://sosign-admin-one.vercel.app",
      "https://sosign-frontend.vercel.app",
    ];

console.log("Allowed CORS origins:", allowedOrigins);

// Manual CORS headers for ALL requests (ensures headers are always set)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  }

  // Handle preflight OPTIONS requests immediately
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Also use cors middleware for additional handling
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // In development, allow all localhost origins
      if (
        process.env.NODE_ENV !== "production" &&
        origin.includes("localhost")
      ) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log("Blocked by CORS:", origin);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

// Security middleware (after CORS so it doesn't interfere with CORS headers)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false, // Disable to prevent CORS conflicts
  }),
);

// Compression middleware (level 6 offers good balance size/cpu)
app.use(
  compression({
    level: 6,
    threshold: 10 * 1000, // Only compress responses > 10KB
  }),
);

// Logging middleware (dev mode)
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);


// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser middleware
app.use(cookieParser());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use("/api/users", userRoutes);
app.use("/api/petitions", petitionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/successful-petitions", successfulPetitionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/ads", adsRoutes);
app.use("/api/download-requests", downloadRequestRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/hide-requests", hideRequestRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/captcha", captchaRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/wallet-requests", walletRequestRoutes);
app.use("/api/aadhaar", aadhaarRoutes);
app.use("/api/subadmin", subAdminRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/crowdfunding", crowdfundingRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/pan", panRoutes);
app.use("/api/voter", voterRoutes);
app.use("/api/progress-updates", progressUpdateRoutes);
app.use("/api/plans", planRoutes);


// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "SOSign API Server",
    version: "1.0.0",
    endpoints: {
      users: "/api/users",
      petitions: "/api/petitions",
      admin: "/api/admin",
      comments: "/api/comments",
      successfulPetitions: "/api/successful-petitions",
      ads: "/api/ads",
      downloadRequests: "/api/download-requests",
      blogs: "/api/blogs",
      categories: "/api/categories",
      captcha: "/api/captcha",
      aadhaar: "/api/aadhaar",
      health: "/health",
    },
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                   SOSign Backend Server                   ║
╠═══════════════════════════════════════════════════════════╣
║  Status:      Running                                     ║
║  Port:        ${PORT}                                          ║
║  Environment: ${process.env.NODE_ENV || "development"}                                 ║
║  Time:        ${new Date().toISOString()}             ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err, promise) => {
  console.error(`Unhandled Rejection: ${err.message}`);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

export default app;
