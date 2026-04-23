import fetch from "node-fetch";

/**
 * Send OTP via 2Factor.in
 * @param {string} phoneNumber - 10-digit mobile number
 * @returns {Promise<string>} - Session ID returned by 2Factor.in
 */
export const sendOTP = async (phoneNumber) => {
  const apiKey = process.env.TWO_FACTOR_API_KEY;
  const templateName = "OTP1"; // As per user request
  const url = `https://2factor.in/API/V1/${apiKey}/SMS/${phoneNumber}/AUTOGEN/${templateName}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.Status === "Success") {
      return data.Details; // This is the SessionId
    } else {
      throw new Error(data.Details || "Failed to send OTP");
    }
  } catch (error) {
    console.error("2Factor Send OTP Error:", error);
    throw new Error(error.message || "Failed to send OTP");
  }
};

/**
 * Verify OTP via 2Factor.in
 * @param {string} sessionId - Session ID returned during sendOTP
 * @param {string} otp - OTP entered by user
 * @returns {Promise<boolean>} - True if OTP is matched
 */
export const verifyOTP = async (sessionId, otp) => {
  const apiKey = process.env.TWO_FACTOR_API_KEY;
  const url = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.Status === "Success" && data.Details === "OTP Matched") {
      return true;
    } else {
      throw new Error(data.Details || "Invalid OTP");
    }
  } catch (error) {
    console.error("2Factor Verify OTP Error:", error);
    throw new Error(error.message || "Failed to verify OTP");
  }
};
