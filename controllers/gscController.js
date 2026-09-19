import { google } from "googleapis";
import path from "path";
import fs from "fs";

// Path to downloaded Google Service Account JSON key in backend root
const KEY_PATH = path.join(process.cwd(), "credentials.json");

/**
 * Returns GSC Auth Client if credentials file or environment variable exists, otherwise returns null
 */
const getAuthClient = () => {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const credentials = typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === "string"
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
        : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      return new google.auth.GoogleAuth({
        credentials,
        scopes: [
          "https://www.googleapis.com/auth/webmasters",
          "https://www.googleapis.com/auth/indexing"
        ],
      });
    }

    if (fs.existsSync(KEY_PATH)) {
      return new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: [
          "https://www.googleapis.com/auth/webmasters",
          "https://www.googleapis.com/auth/indexing"
        ],
      });
    }

    return null;
  } catch (error) {
    console.error("Failed to initialize Google GSC auth client:", error);
    return null;
  }
};

/**
 * Check if credentials.json or GOOGLE_SERVICE_ACCOUNT_JSON is configured
 * GET /api/admin/gsc/status
 */
export const getGscStatus = (req, res) => {
  const hasEnv = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const hasFile = fs.existsSync(KEY_PATH);
  const exists = hasEnv || hasFile;
  return res.status(200).json({
    success: true,
    configured: exists,
    source: hasEnv ? "environment_variable" : (hasFile ? "credentials_file" : "none"),
    message: exists 
      ? "Google Search Console and Indexing API credentials are configured." 
      : "Google GSC credentials are missing (neither credentials.json file nor GOOGLE_SERVICE_ACCOUNT_JSON found)."
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

/**
 * Request instant indexing/update or deletion via Google Indexing API
 * POST /api/admin/gsc/publish
 */
export const publishToIndex = async (req, res) => {
  try {
    const { url, type = "URL_UPDATED" } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "URL is required for indexing request.",
      });
    }

    const auth = getAuthClient();
    if (!auth) {
      return res.status(400).json({
        success: false,
        setupRequired: true,
        message: "Google Service Account credentials.json is missing. Please generate credentials on Google Cloud and upload them as credentials.json to integrate Google Search Console and Indexing API.",
      });
    }

    const indexing = google.indexing({
      version: "v3",
      auth: auth,
    });

    const response = await indexing.urlNotifications.publish({
      requestBody: {
        url,
        type,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Google Indexing API call successful for: ${url}`,
      data: response.data,
    });
  } catch (error) {
    console.error("Google Indexing API Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to notify Google Indexing API.",
    });
  }
};

/**
 * Automatically index all published blogs and active petitions to Google & IndexNow
 * POST /api/admin/gsc/auto-index-all
 */
export const autoIndexAll = async (req, res) => {
  try {
    const baseUrl = "https://sosign.in";

    const Blog = (await import("../models/blogModel.js")).default;
    const Petition = (await import("../models/petitionModel.js")).default;
    const { notifyIndexNow, notifyGoogleIndexingApi, notifySitemapToGoogle } = await import("../utils/autoIndexerUtils.js");

    const [blogs, petitions] = await Promise.all([
      Blog.find({ isPublished: true }, "slug").lean(),
      Petition.find({ status: "approved" }, "slug").lean(),
    ]);

    const coreUrls = [
      baseUrl,
      `${baseUrl}/blog`,
      `${baseUrl}/currentpetitions`,
      `${baseUrl}/about`,
      `${baseUrl}/contact`,
    ];

    const blogUrls = blogs.map((b) => `${baseUrl}/blog/${b.slug}`);
    const petitionUrls = petitions.map((p) => `${baseUrl}/currentpetitions/${p.slug}`);

    const allUrls = [...coreUrls, ...blogUrls, ...petitionUrls];

    // 1. Submit to IndexNow (Bing, Yandex, etc.) - instant search engine broadcast
    const indexNowResult = await notifyIndexNow(allUrls);

    // 2. Submit sitemap to Google Search Console
    const sitemapResult = await notifySitemapToGoogle();

    // 3. Submit blogs to Google Indexing API if service account is configured
    let googleSuccessCount = 0;
    const auth = getAuthClient();
    if (auth) {
      const topUrls = blogUrls.slice(0, 50);
      for (const url of topUrls) {
        try {
          await notifyGoogleIndexingApi(url, "URL_UPDATED");
          googleSuccessCount++;
        } catch (e) {
          console.warn(`[GSC] Error indexing ${url}:`, e.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Indexed ${allUrls.length} total URLs to IndexNow. Google Indexing submitted: ${googleSuccessCount} URLs.`,
      totalUrls: allUrls.length,
      indexNowSuccess: indexNowResult.success,
      googleConfigured: !!auth,
      googleSubmitted: googleSuccessCount,
      sitemapSubmitted: sitemapResult.success,
    });
  } catch (error) {
    console.error("Auto Index All Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to execute automated indexing.",
    });
  }
};

/**
 * Upload Google Service Account credentials.json from Admin Panel
 * POST /api/admin/gsc/upload-credentials
 */
export const uploadCredentials = async (req, res) => {
  try {
    let jsonContent = null;

    if (req.body?.credentials) {
      jsonContent = typeof req.body.credentials === "string" 
        ? JSON.parse(req.body.credentials) 
        : req.body.credentials;
    } else if (req.file) {
      const fileRaw = fs.readFileSync(req.file.path, "utf8");
      jsonContent = JSON.parse(fileRaw);
    }

    if (!jsonContent || !jsonContent.client_email || !jsonContent.private_key) {
      return res.status(400).json({
        success: false,
        message: "Invalid Google service account JSON. It must contain 'client_email' and 'private_key'.",
      });
    }

    fs.writeFileSync(KEY_PATH, JSON.stringify(jsonContent, null, 2), "utf8");

    return res.status(200).json({
      success: true,
      message: `Successfully installed Google Service Account for ${jsonContent.client_email}. Google Indexing is now active!`,
      clientEmail: jsonContent.client_email,
    });
  } catch (error) {
    console.error("Upload credentials error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to save credentials.json.",
    });
  }
};


