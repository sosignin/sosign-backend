/**
 * Safely extracts and normalizes client IP address to standard IPv4 or valid IPv6.
 * Converts IPv6 localhost loopback (::1, ::ffff:127.0.0.1) into standard 127.0.0.1.
 */
export const getCleanIp = (req) => {
  if (!req) return "127.0.0.1";

  // Check headers in order of proxy / CDN reliability
  const rawIp =
    req.headers?.["cf-connecting-ip"] || // Cloudflare
    req.headers?.["x-real-ip"] ||        // Nginx / reverse proxy
    req.headers?.["x-client-ip"] ||
    req.headers?.["x-forwarded-for"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    "127.0.0.1";

  // If x-forwarded-for has multiple comma-separated IPs (client, proxy1, proxy2), take first
  let ip = String(rawIp).split(",")[0].trim();

  // Strip IPv4-mapped IPv6 prefix: ::ffff:192.168.1.1 -> 192.168.1.1
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  // Normalize IPv6 localhost loopback representations to standard 127.0.0.1
  if (
    ip === "::1" ||
    ip === "1" ||
    ip === "::" ||
    ip === "localhost" ||
    ip === "0.0.0.0" ||
    ip === "::ffff:127.0.0.1"
  ) {
    ip = "127.0.0.1";
  }

  // Final fallback
  if (!ip || ip.length < 3) {
    ip = "127.0.0.1";
  }

  return ip;
};

export default getCleanIp;
