import axios from "axios";
import { google } from "googleapis";
import path from "path";
import fs from "fs";

const KEY_PATH = path.join(process.cwd(), "credentials.json");
const HOST = "sosign.in";
const INDEXNOW_KEY = "sosign2026indexnowkey";
const INDEXNOW_KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;

export const getGoogleAuthClient = () => {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const credentials = typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === "string"
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
        : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      return new google.auth.GoogleAuth({
        credentials,
        scopes: [
          "https://www.googleapis.com/auth/webmasters",
          "https://www.googleapis.com/auth/indexing",
        ],
      });
    }

    if (fs.existsSync(KEY_PATH)) {
      return new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: [
          "https://www.googleapis.com/auth/webmasters",
          "https://www.googleapis.com/auth/indexing",
        ],
      });
    }

    return null;
  } catch (error) {
    console.error("[AutoIndexer] Failed to initialize Google Auth Client:", error.message);
    return null;
  }
};

/**
 * Submit URL to Google Indexing API
 */
export const notifyGoogleIndexingApi = async (url, type = "URL_UPDATED") => {
  try {
    const auth = getGoogleAuthClient();
    if (!auth) {
      console.log(`[AutoIndexer] Google Indexing API skipped for ${url} (credentials.json not yet placed in backend root).`);
      return { success: false, reason: "credentials_missing" };
    }

    const indexing = google.indexing({
      version: "v3",
      auth,
    });

    const res = await indexing.urlNotifications.publish({
      requestBody: {
        url,
        type,
      },
    });

    console.log(`[AutoIndexer] Google Indexing API success for ${url}:`, res.data);
    return { success: true, data: res.data };
  } catch (error) {
    console.error(`[AutoIndexer] Google Indexing API error for ${url}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Submit URL(s) to IndexNow (Bing, Yandex, Naver, Seznam, and participating search engines)
 */
export const notifyIndexNow = async (urls) => {
  try {
    const urlList = Array.isArray(urls) ? urls : [urls];
    if (!urlList.length) return { success: false, reason: "no_urls" };

    const payload = {
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList,
    };

    const res = await axios.post("https://api.indexnow.org/indexnow", payload, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 10000,
    });

    console.log(`[AutoIndexer] IndexNow notified for ${urlList.length} URL(s). Response code: ${res.status}`);
    return { success: true, status: res.status };
  } catch (error) {
    console.error("[AutoIndexer] IndexNow submission error:", error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Submit Sitemap to Google Search Console
 */
export const notifySitemapToGoogle = async (sitemapUrl = `https://${HOST}/sitemap.xml`) => {
  try {
    const auth = getGoogleAuthClient();
    if (!auth) {
      return { success: false, reason: "credentials_missing" };
    }

    const searchconsole = google.searchconsole({
      version: "v1",
      auth,
    });

    await searchconsole.sitemaps.submit({
      feedpath: sitemapUrl,
      siteUrl: `https://${HOST}`,
    });

    console.log(`[AutoIndexer] Sitemap successfully queued with Google Search Console: ${sitemapUrl}`);
    return { success: true };
  } catch (error) {
    console.error("[AutoIndexer] GSC Sitemap submit error:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Unified Auto-Indexer: notifies Google Indexing API + IndexNow simultaneously
 * Completely non-blocking and fail-safe.
 */
export const autoIndexUrl = (url, type = "URL_UPDATED") => {
  if (!url) return;

  // Run in background without delaying HTTP responses
  Promise.allSettled([
    notifyGoogleIndexingApi(url, type),
    notifyIndexNow(url),
    notifySitemapToGoogle(),
  ]).then(() => {
    console.log(`[AutoIndexer] Automated submission cycle finished for ${url}`);
  }).catch((err) => {
    console.error(`[AutoIndexer] Exception during indexing cycle for ${url}:`, err.message);
  });
};
