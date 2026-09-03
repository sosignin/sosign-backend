import AdminNotification from "../models/adminNotificationModel.js";

/**
 * Creates an admin notification in a safe, non-blocking way.
 * 
 * @param {Object} options
 * @param {string} options.category - One of the 13 supported categories
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
      console.warn("[AdminNotifier] Skipped: missing required fields", { category, title, message });
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
    return notification;
  } catch (error) {
    console.error("[AdminNotifier] Error creating admin notification:", error.message);
    return null;
  }
}

export default createAdminNotification;
