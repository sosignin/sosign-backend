/**
 * PlanAPI Aadhaar OCR – extract Aadhaar details from front & back card images.
 *
 * API:  POST https://planapi.in/Api/Ekyc/AadhaarOCR
 * Auth: TokenID, ApiUserID, ApiPassword headers
 * Body: multipart/form-data with FrontImage and BackImage file fields
 *
 * Success error codes: 100, 200, 211
 */

import FormData from "form-data";
import fetch from "node-fetch";

const DEFAULT_OCR_URL = "https://planapi.in/Api/Ekyc/AadhaarOCR";

const getPlanApiConfig = () => {
  const tokenId = process.env.PLANAPI_TOKEN_ID?.trim();
  const apiUserId = process.env.PLANAPI_USER_ID?.trim();
  const apiPassword = process.env.PLANAPI_PASSWORD?.trim();

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

  // Always use the npm `form-data` package for reliable multipart uploads
  const form = new FormData();
  form.append("FrontImage", frontImageBuffer, {
    filename: frontOriginalName,
    contentType: "image/jpeg",
  });
  form.append("BackImage", backImageBuffer, {
    filename: backOriginalName,
    contentType: "image/jpeg",
  });

  const headers = {
    TokenID: config.tokenId,
    ApiUserID: config.apiUserId,
    ApiPassword: config.apiPassword,
    Accept: "application/json",
    ...form.getHeaders(),
  };

  console.log("[AadhaarOCR] Sending request to:", config.ocrUrl);

  const response = await fetch(config.ocrUrl, {
    method: "POST",
    headers,
    body: form,
  });

  // Parse response
  const rawText = await response.text();
  console.log("[AadhaarOCR] Response status:", response.status, "body:", rawText.substring(0, 500));

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(
      `Aadhaar OCR returned non-JSON response (HTTP ${response.status})`,
    );
  }

  // PlanAPI treats error codes 100, 200, 211 as success
  const errorCode = Number(
    payload?.Errorcode ?? payload?.errorcode ?? payload?.ErrorCode ?? -1,
  );
  const isSuccess =
    [100, 200, 211].includes(errorCode) ||
    String(payload?.Status || "").toLowerCase() === "success";

  if (!isSuccess) {
    const msg =
      payload?.Message ||
      payload?.message ||
      `Aadhaar OCR failed (code ${errorCode})`;
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
};

export { verifyAadhaarByImages };
