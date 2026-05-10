/**
 * PlanAPI Aadhaar OCR – extract Aadhaar details from front & back card images.
 *
 * API:  POST https://planapi.in/Api/Ekyc/AadhaarOCR
 * Auth: TokenID, ApiUserID, ApiPassword headers
 * Body: multipart/form-data with FrontImage and BackImage file fields
 *
 * Success error codes: 100, 200, 211
 */

import axios from "axios";
import FormData from "form-data";

const DEFAULT_OCR_URL = "https://planapi.in/Api/Ekyc/AadhaarOCR";

const getPlanApiConfig = () => {
  const tokenId = process.env.PLANAPI_TOKEN_ID?.trim();
  const apiUserId = process.env.PLANAPI_USER_ID?.trim();
  const apiPassword = process.env.PLANAPI_PASSWORD?.trim();
  const apiMode = process.env.PLANAPI_MODE?.trim() || "1";

  if (!tokenId || !apiUserId || !apiPassword) {
    throw new Error("Aadhaar KYC service is not configured");
  }

  return {
    tokenId,
    apiUserId,
    apiPassword,
    ocrUrl: process.env.PLANAPI_AADHAAR_OCR_URL?.trim() || DEFAULT_OCR_URL,
  };
};

/**
 * @param {Buffer} frontImageBuffer – JPEG/PNG buffer of front side
 * @param {Buffer} backImageBuffer  – JPEG/PNG buffer of back side
 * @param {string} [frontOriginalName] – original file name for the front image
 * @param {string} [backOriginalName]  – original file name for the back image
 * @returns {Promise<object>} – parsed Aadhaar data on success
 */
const verifyAadhaarByImages = async (
  frontImageBuffer,
  backImageBuffer,
  frontOriginalName = "front.jpg",
  backOriginalName = "back.jpg",
) => {
  const config = getPlanApiConfig();

  const form = new FormData();
  
  // Clean request: Only images in body, credentials in headers
  form.append("FrontImage", frontImageBuffer, { filename: "front.jpg", contentType: "image/jpeg" });
  form.append("BackImage", backImageBuffer, { filename: "back.jpg", contentType: "image/jpeg" });

  const headers = {
    TokenID: config.tokenId,
    ApiUserID: config.apiUserId,
    ApiPassword: config.apiPassword,
    ...form.getHeaders(),
  };

  console.log("[AadhaarOCR] Attempting clean multipart request. Headers only auth.");

  try {
    const response = await axios.post(config.ocrUrl, form, {
      headers,
      timeout: 30000, // 30 seconds timeout
    });

    const payload = response.data;
    console.log("[AadhaarOCR] Response:", JSON.stringify(payload).substring(0, 500));

    // PlanAPI treats error codes 100, 200, 211 as success
    const errorCode = Number(
      payload?.Errorcode ?? payload?.errorcode ?? payload?.ErrorCode ?? -1,
    );
    const isSuccess =
      [100, 200, 211].includes(errorCode) ||
      String(payload?.Status || "").toLowerCase() === "success";

    if (!isSuccess) {
      let msg = payload?.Message || payload?.message || `Aadhaar OCR failed (code ${errorCode})`;
      throw new Error(msg);
    }

    const data = payload?.data || {};
    return {
      aadhaarNumber: data.AadharNumber || data.AadhaarNumber || "",
      name: data.Name || "",
      dob: data.DOB || "",
      address: data.Address || "",
      state: data.State || "",
      pincode: data.Pincode || "",
      valid: String(data.Valid || "").toLowerCase() === "true",
      raw: payload,
    };
  } catch (error) {
    if (error.response) {
      console.error("[AadhaarOCR] API Error Response:", error.response.status, error.response.data);
      const msg = error.response.data?.Message || error.response.data?.message || `API Error ${error.response.status}`;
      throw new Error(msg);
    }
    console.error("[AadhaarOCR] Request Error:", error.message);
    throw error;
  }
};

export { verifyAadhaarByImages };
