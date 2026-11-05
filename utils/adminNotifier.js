import AdminNotification from "../models/adminNotificationModel.js";

const DEFAULT_ONESIGNAL_APP_ID = "7ea7a883-4e39-461c-b45e-cd6a7db07560";

/**
 * Dispatches a Web Push notification via OneSignal REST API to subscribed admin browsers.
 *
 * @param {Object} options
 * @param {string} options.title - Notification heading
 * @param {string} options.message - Notification body text
 * @param {string} [options.link="/dashboard"] - Admin dashboard path or full URL
 * @param {string} [options.category="system"] - Notification category
 * @param {string|Object} [options.relatedId=null] - Referenced document ID
 * @param {string|Object} [options.notificationId=null] - Stored AdminNotification ID
 * @param {string[]} [options.segments=["All"]] - Target OneSignal segments
 * @returns {Promise<{sent: boolean, status?: number, response?: any, reason?: string}>}
 */
export async function sendOneSignalPushNotification({
  title,
  message,
  link = "/dashboard",
  category = "system",
  relatedId = null,
  notificationId = null,
  segments = ["All"],
}) {
  try {
    const appId = (process.env.ONESIGNAL_APP_ID || DEFAULT_ONESIGNAL_APP_ID).trim();
    const apiKey = (process.env.ONESIGNAL_REST_API_KEY || "").trim();

    if (!apiKey) {
      return { sent: false, reason: "ONESIGNAL_REST_API_KEY is not configured" };
    }

    const adminBaseUrl = (
      process.env.ADMIN_PANEL_URL || "https://sosign-admin-one.vercel.app"
    ).replace(/\/$/, "");
    const targetUrl =
      link && link.startsWith("http")
        ? link
        : `${adminBaseUrl}${link?.startsWith("/") ? link : `/${link || "dashboard"}`}`;

    const iconUrl = `${adminBaseUrl}/log.png`;

    const payload = {
      app_id: appId,
      target_channel: "push",
      name: `SOSign Admin - ${category || "system"}`,
      headings: { en: title },
      contents: { en: message },
      included_segments: segments,
      web_url: targetUrl,
      chrome_web_icon: iconUrl,
      chrome_web_badge: iconUrl,
      firefox_icon: iconUrl,
      data: {
        category: category || "system",
        link: link || "/dashboard",
        relatedId: relatedId ? String(relatedId) : null,
        notificationId: notificationId ? String(notificationId) : null,
      },
    };

    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.warn(
        `[AdminNotifier][OneSignal] Push dispatch returned HTTP ${res.status}:`,
        responseData?.errors || responseData
      );
      return { sent: false, status: res.status, response: responseData };
    }

    return { sent: true, status: res.status, response: responseData };
  } catch (err) {
    console.error("[AdminNotifier][OneSignal] Push error:", err.message);
    return { sent: false, reason: err.message };
  }
}

/**
 * Creates an admin notification in MongoDB and triggers a OneSignal Web Push notification
 * in a safe, non-blocking way.
 *
 * @param {Object} options
 * @param {string} options.category - One of the supported categories
 * @param {string} options.title - Short descriptive title
 * @param {string} options.message - Summary/detail message
 * @param {string} options.link - Dashboard route link e.g. "/dashboard/petition-approval"
 * @param {string|mongoose.Types.ObjectId} [options.relatedId] - Referenced document ID
 * @param {Object} [options.meta] - Extra metadata (creator, count, city, amount, etc.)
 * @returns {Promise<AdminNotification|null>}
 */
export async function createAdminNotification({
  category,
  title,
  message,
  link = "/dashboard",
  relatedId = null,
  meta = {},
}) {
  try {
    if (!category || !title || !message) {
      console.warn("[AdminNotifier] Skipped: missing required fields", {
        category,
        title,
        message,
      });
      return null;
    }

    const notification = await AdminNotification.create({
      category,
      title,
      message,
      link,
      relatedId,
      meta,
      isRead: false,
    });

    console.log(`[AdminNotifier] Created notification [${category}]: ${title}`);

    // Dispatch OneSignal desktop push notification asynchronously (non-blocking)
    sendOneSignalPushNotification({
      title,
      message,
      link,
      category,
      relatedId,
      notificationId: notification._id,
    }).catch(() => {});

    return notification;
  } catch (error) {
    console.error("[AdminNotifier] Error creating admin notification:", error.message);
    return null;
  }
}

export default createAdminNotification;
