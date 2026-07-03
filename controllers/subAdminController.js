import jwt from "jsonwebtoken";
import SubAdmin from "../models/subAdminModel.js";

// Sub-admin login
export const subAdminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const subAdmin = await SubAdmin.findOne({ email: email.trim().toLowerCase() });

    if (!subAdmin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!subAdmin.isActive) {
      return res.status(403).json({ message: "Your account has been deactivated. Contact the administrator." });
    }

    const isMatch = await subAdmin.comparePassword(password.trim());
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: subAdmin._id,
        email: subAdmin.email,
        name: subAdmin.name,
        role: "subadmin",
        permissions: subAdmin.permissions,
      },
      process.env.JWT_SECRET || "default_jwt_secret_key",
      { expiresIn: "1d" }
    );

    res.cookie("adminToken", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    return res.status(200).json({
      message: "Sub-admin logged in successfully",
      token,
      admin: {
        email: subAdmin.email,
        name: subAdmin.name,
        role: "subadmin",
        permissions: subAdmin.permissions,
      },
    });
  } catch (error) {
    console.error("Sub-admin login error:", error);
    return res.status(500).json({ message: "Server error during login" });
  }
};

// Create a new sub-admin (super admin only)
export const createSubAdmin = async (req, res) => {
  try {
    const { name, email, password, permissions } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    // Check if email already exists
    const existing = await SubAdmin.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "A sub-admin with this email already exists" });
    }

    const subAdmin = new SubAdmin({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      permissions: permissions || [],
    });

    await subAdmin.save();

    // Return the created sub-admin (without password)
    const created = subAdmin.toObject();
    delete created.password;

    return res.status(201).json({
      message: "Sub-admin created successfully",
      subAdmin: created,
    });
  } catch (error) {
    console.error("Error creating sub-admin:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "A sub-admin with this email already exists" });
    }
    return res.status(500).json({ message: error.message });
  }
};

// Get all sub-admins (super admin only)
export const getAllSubAdmins = async (req, res) => {
  try {
    const subAdmins = await SubAdmin.find({}, "-password").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, subAdmins });
  } catch (error) {
    console.error("Error fetching sub-admins:", error);
    return res.status(500).json({ message: error.message });
  }
};

// Update a sub-admin (super admin only)
export const updateSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, permissions, isActive } = req.body;

    const subAdmin = await SubAdmin.findById(id);
    if (!subAdmin) {
      return res.status(404).json({ message: "Sub-admin not found" });
    }

    // Check email uniqueness if changing
    if (email && email.trim().toLowerCase() !== subAdmin.email) {
      const existing = await SubAdmin.findOne({ email: email.trim().toLowerCase() });
      if (existing) {
        return res.status(409).json({ message: "A sub-admin with this email already exists" });
      }
      subAdmin.email = email.trim().toLowerCase();
    }

    if (name !== undefined) subAdmin.name = name.trim();
    if (permissions !== undefined) subAdmin.permissions = permissions;
    if (isActive !== undefined) subAdmin.isActive = isActive;

    await subAdmin.save();

    const updated = subAdmin.toObject();
    delete updated.password;

    return res.status(200).json({
      message: "Sub-admin updated successfully",
      subAdmin: updated,
    });
  } catch (error) {
    console.error("Error updating sub-admin:", error);
    return res.status(500).json({ message: error.message });
  }
};

// Delete a sub-admin (super admin only)
export const deleteSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const subAdmin = await SubAdmin.findById(id);

    if (!subAdmin) {
      return res.status(404).json({ message: "Sub-admin not found" });
    }

    await SubAdmin.findByIdAndDelete(id);
    return res.status(200).json({ message: "Sub-admin deleted successfully" });
  } catch (error) {
    console.error("Error deleting sub-admin:", error);
    return res.status(500).json({ message: error.message });
  }
};

// Reset sub-admin password (super admin only)
export const resetSubAdminPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const subAdmin = await SubAdmin.findById(id);
    if (!subAdmin) {
      return res.status(404).json({ message: "Sub-admin not found" });
    }

    subAdmin.password = newPassword.trim();
    await subAdmin.save(); // pre-save hook will hash it

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password:", error);
    return res.status(500).json({ message: error.message });
  }
};
