import { google } from "googleapis";
import path from "path";
import fs from "fs";

// Path to downloaded Google Service Account JSON key in backend root
const KEY_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Returns GSC Auth Client if credentials file exists, otherwise returns null
 */
const getAuthClient = () => {
  if (!fs.existsSync(KEY_PATH)) {
    return null;
  }
  
  try {
    return new google.auth.GoogleAuth({
      keyFile: KEY_PATH,
      scopes: ["https://www.googleapis.com/auth/webmasters"], // Read/Write access to GSC
    });
  } catch (error) {
    console.error("Failed to initialize Google GSC auth client:", error);
    return null;
  }
};

/**
 * Check if credentials.json is configured
 * GET /api/admin/gsc/status
 */
export const getGscStatus = (req, res) => {
  const exists = fs.existsSync(KEY_PATH);
  return res.status(200).json({
    success: true,
    configured: exists,
    message: exists 
      ? "Google GSC credentials.json is configured." 
      : "Google GSC credentials.json is missing in backend directory."
  });
};

/**
 * Fetch Google Search Console SEO performance data
 * POST /api/admin/gsc/performance
 */
export const getGscPerformance = async (req, res) => {
  try {
    const {
      siteUrl = "https://sosign.in",
      startDate,
      endDate,
      dimensions = ["query", "page"],
      rowLimit = 25
    } = req.body;

    const auth = getAuthClient();
    if (!auth) {
      return res.status(400).json({
        success: false,
        setupRequired: true,
        message: "Google Service Account credentials.json is missing in the backend root directory. Please generate credentials on Google Cloud and upload them as credentials.json to integrate Google Search Console.",
      });
    }

    // Default dates (previous 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const formattedEndDate = endDate || today.toISOString().split("T")[0];
    const formattedStartDate = startDate || thirtyDaysAgo.toISOString().split("T")[0];

    const searchconsole = google.searchconsole({
      version: "v1",
      auth: auth,
    });

    const response = await searchconsole.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        dimensions: dimensions,
        rowLimit: parseInt(rowLimit) || 25,
      },
    });

    return res.status(200).json({
      success: true,
      data: response.data.rows || [],
    });
  } catch (error) {
    console.error("GSC Performance Fetch Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch performance data from Google Search Console API.",
    });
  }
};

/**
 * Inspect Google indexing status for a specific page
 * POST /api/admin/gsc/inspect
 */
export const inspectUrl = async (req, res) => {
  try {
    const {
      inspectionUrl,
      siteUrl = "https://sosign.in"
    } = req.body;

    if (!inspectionUrl) {
      return res.status(400).json({
        success: false,
        message: "Inspection URL is required.",
      });
    }

    const auth = getAuthClient();
    if (!auth) {
      return res.status(400).json({
        success: false,
        setupRequired: true,
        message: "Google Service Account credentials.json is missing. Please upload the key file in the backend root folder.",
      });
    }

    const searchconsole = google.searchconsole({
      version: "v1",
      auth: auth,
    });

    const response = await searchconsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl,
        siteUrl,
      },
    });

    return res.status(200).json({
      success: true,
      data: response.data.inspectionResult || {},
    });
  } catch (error) {
    console.error("GSC Inspect URL Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to inspect URL using Google URL Inspection API.",
    });
  }
};

/**
 * Submit sitemap to Google Search Console
 * POST /api/admin/gsc/submit-sitemap
 */
export const submitSitemap = async (req, res) => {
  try {
    const {
      sitemapUrl = "https://sosign.in/sitemap.xml",
      siteUrl = "https://sosign.in"
    } = req.body;

    const auth = getAuthClient();
    if (!auth) {
      return res.status(400).json({
        success: false,
        setupRequired: true,
        message: "Google Service Account credentials.json is missing. Please upload the key file to trigger sitemap submissions.",
      });
    }

    const searchconsole = google.searchconsole({
      version: "v1",
      auth: auth,
    });

    await searchconsole.sitemaps.submit({
      feedpath: sitemapUrl,
      siteUrl,
    });

    return res.status(200).json({
      success: true,
      message: `Sitemap successfully submitted to Google index queue: ${sitemapUrl}`,
    });
  } catch (error) {
    console.error("GSC Submit Sitemap Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to submit sitemap to Google Search Console.",
    });
  }
};
