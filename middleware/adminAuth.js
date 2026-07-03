import jwt from "jsonwebtoken";

export const adminAuth = (req, res, next) => {
  let token = req.cookies?.adminToken;

  if (!token && req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    console.log("No token found in cookies or Authorization header");
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_jwt_secret_key");
    console.log("Token verified successfully:", decoded);
    // Attach admin info including role and permissions
    req.admin = {
      ...decoded,
      role: decoded.role || "superadmin", // legacy tokens without role are super admins
      permissions: decoded.permissions || [],
    };
    next();
  } catch (error) {
    console.error("JWT verification error:", error);
    return res.status(401).json({ message: "Invalid token" });
  }
};
