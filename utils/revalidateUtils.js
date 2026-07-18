import axios from "axios";

/**
 * Trigger Next.js On-Demand Revalidation webhook on the frontend
 * @param {string} path - The path to revalidate (e.g. '/currentpetitions/my-petition-slug' or '/currentpetitions')
 */
export const triggerRevalidation = async (path) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const secret = process.env.VALID_EMAIL_TOKEN || "2bfb71cea3dc47ea8f4cf47b5862fa60";

    const revalidateUrl = `${frontendUrl}/api/revalidate`;

    console.log(`[Revalidation Webhook] Triggering for path: ${path} via ${revalidateUrl}`);

    // Call the frontend revalidation route asynchronously (non-blocking)
    axios.post(revalidateUrl, {
      path,
      secret,
    }, {
      timeout: 5000 // 5 seconds timeout
    }).then(response => {
      console.log(`[Revalidation Webhook] Success for path ${path}:`, response.data);
    }).catch(err => {
      console.error(`[Revalidation Webhook] Failed for path ${path}:`, err.message);
    });

  } catch (error) {
    console.error("[Revalidation Webhook] Error setting up callback request:", error.message);
  }
};
