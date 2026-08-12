import jwt from "jsonwebtoken";

const generateToken = (res, userId) => {
  const token = jwt.sign(
    { userId },
    process.env.JWT_SECRET || "default_jwt_secret_key",
    {
      expiresIn: "30d",
    },
  );

  res.cookie("jwt", token, {
    httpOnly: false, // Set to false to allow frontend access
    secure: process.env.NODE_ENV !== "development", // Use original secure logic
    sameSite: process.env.NODE_ENV === "development" ? "lax" : "lax", // Persistent session cookie
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
  return token; // Return the token
};

export default generateToken;
