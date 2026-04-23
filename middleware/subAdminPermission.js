// Middleware factory to check if the current user has the required permission
// Super admins (role === "superadmin") bypass all permission checks
export const requirePermission = (permissionKey) => {
  return (req, res, next) => {
    // If no admin info attached (shouldn't happen if adminAuth runs first)
    if (!req.admin) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Super admin has all permissions
    if (req.admin.role === "superadmin") {
      return next();
    }

    // Sub-admin: check permissions array
    if (req.admin.role === "subadmin") {
      const permissions = req.admin.permissions || [];
      if (permissions.includes(permissionKey)) {
        return next();
      }
      return res.status(403).json({ message: "You do not have permission to access this resource" });
    }

    // Unknown role
    return res.status(403).json({ message: "Access denied" });
  };
};

// Middleware to ensure only super admin can access
export const superAdminOnly = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  if (req.admin.role === "superadmin") {
    return next();
  }

  return res.status(403).json({ message: "Only super admin can access this resource" });
};
