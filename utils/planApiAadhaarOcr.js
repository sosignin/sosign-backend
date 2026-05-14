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
  const apiMode = process.env.PLANAPI_MODE?.trim() || "1";

  // Convert buffers to Base64 strings
  const frontBase64 = frontImageBuffer.toString("base64");
  const backBase64 = backImageBuffer.toString("base64");

  // PlanAPI often requires x-www-form-urlencoded for Base64 fields
  const body = new URLSearchParams({
    TokenID: config.tokenId,
    ApiUserID: config.apiUserId,
    ApiPassword: config.apiPassword,
    ApiMode: apiMode,
    FrontImage: frontBase64,
    BackImage: backBase64,
  });

  const headers = {
    "TokenID": config.tokenId,
    "ApiUserID": config.apiUserId,
    "ApiPassword": config.apiPassword,
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
  };

  console.log("[AadhaarOCR] Sending URL-encoded request via fetch to:", config.ocrUrl);

  try {
    const response = await fetch(config.ocrUrl, {
      method: "POST",
      headers,
      body: body.toString(),
    });

    const raw = await response.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      console.error("[AadhaarOCR] Non-JSON response:", raw.substring(0, 500));
      throw new Error(`Invalid response from API (HTTP ${response.status})`);
    }

    console.log("[AadhaarOCR] Response:", JSON.stringify(payload).substring(0, 500));

    // PlanAPI treats error codes 100, 200, 211 as success
    const errorCode = Number(
      payload?.Errorcode ?? payload?.errorcode ?? payload?.ErrorCode ?? payload?.code ?? -1,
    );
    const isSuccess =
      [100, 200, 211].includes(errorCode) ||
      String(payload?.Status || payload?.status || "").toLowerCase() === "success";

    if (!isSuccess) {
      let msg = payload?.Message || payload?.message || payload?.msg || `Aadhaar OCR failed (code ${errorCode})`;
      throw new Error(msg);
    }

    const data = payload?.data || payload?.response || {};
    return {
      aadhaarNumber: data.AadharNumber || data.AadhaarNumber || data.aadhaar_number || "",
      name: data.Name || data.name || "",
      dob: data.DOB || data.dob || "",
      address: data.Address || data.address || "",
      state: data.State || data.state || "",
      pincode: data.Pincode || data.pincode || "",
      valid: String(data.Valid || data.valid || "").toLowerCase() === "true",
      raw: payload,
    };
  } catch (error) {
    console.error("[AadhaarOCR] Error:", error.message);
    throw error;
  }
};

export { verifyAadhaarByImages };
