import axios from "axios";

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
    initUrl: "https://planapi.in/Api/Ekyc/DigiLockerInitialize",
    statusUrl: "https://planapi.in/Api/Ekyc/DigiLockerStatus",
    downloadUrl: "https://planapi.in/Api/Ekyc/DigiLockerDownloadAadhar",
  };
};

const buildHeaders = (config) => ({
  TokenID: config.tokenId,
  ApiUserID: config.apiUserId,
  ApiPassword: config.apiPassword,
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "application/json",
});

/**
 * Step 1: Initialize DigiLocker request and generate OAuth URL
 */
export const initializeDigilockerSession = async (params = {}) => {
  const config = getPlanApiConfig();
  const { name, email, mobileNo, redirectUrl, logoUrl } = params;

  // Sanitize mobile number (PlanAPI wants 10 digits without leading 0 or +91)
  const cleanMobile = (mobileNo || "").replace(/^0+/, "").replace(/\D/g, "").slice(-10);

  const body = new URLSearchParams();
  body.append("Name", name || "");
  body.append("Email", email || "");
  body.append("MobileNo", cleanMobile || "");
  body.append("RedirectUrl", redirectUrl || "");
  if (logoUrl) body.append("Logo_URL", logoUrl);

  const headers = buildHeaders(config);

  console.log("[DigiLocker] Initializing with:", {
    url: config.initUrl,
    body: body.toString(),
    headers: { ...headers, ApiPassword: "****" }
  });

  try {
    const response = await axios.post(config.initUrl, body.toString(), {
      headers,
    });

    const payload = response.data;
    const errorCode = Number(payload?.Errorcode ?? payload?.ErrorCode ?? -1);

    if (![100, 200, 211].includes(errorCode)) {
      throw new Error(payload?.msg || payload?.Message || `Initialization failed (${errorCode})`);
    }

    return {
      clientId: payload.response?.client_id,
      url: payload.response?.url,
      expiry: payload.response?.expiry_seconds,
      raw: payload,
    };
  } catch (error) {
    console.error("[DigiLocker] Initialization Error:", error.message);
    throw error;
  }
};

/**
 * Step 2: Check the status of the DigiLocker session
 */
export const checkDigilockerStatus = async (clientId) => {
  const config = getPlanApiConfig();

  const body = new URLSearchParams();
  body.append("Digilocker_Client_Id", clientId);

  const headers = buildHeaders(config);

  try {
    const response = await axios.post(config.statusUrl, body.toString(), {
      headers,
    });

    const payload = response.data;
    const errorCode = Number(payload?.Errorcode ?? payload?.ErrorCode ?? -1);

    if (![100, 200, 211].includes(errorCode)) {
      throw new Error(payload?.Message || payload?.msg || `Status check failed (${errorCode})`);
    }

    return {
      status: payload.Data?.Status,
      isCompleted: payload.Data?.Completed === true || payload.Data?.Completed === "true",
      isFailed: payload.Data?.Failed === true || payload.Data?.Failed === "true",
      aadhaarLinked: payload.Data?.Aadhaar_Linked === true || payload.Data?.Aadhaar_Linked === "true",
      raw: payload,
    };
  } catch (error) {
    console.error("[DigiLocker] Status Error:", error.message);
    throw error;
  }
};

/**
 * Step 3: Download Aadhaar document from DigiLocker
 */
export const downloadDigilockerAadhaar = async (clientId) => {
  const config = getPlanApiConfig();

  const body = new URLSearchParams();
  body.append("Digilocker_Client_Id", clientId);

  const headers = buildHeaders(config);

  try {
    const response = await axios.post(config.downloadUrl, body.toString(), {
      headers,
    });

    const payload = response.data;
    const errorCode = Number(payload?.Errorcode ?? payload?.ErrorCode ?? -1);

    if (![100, 200, 211].includes(errorCode)) {
      throw new Error(payload?.Message || payload?.msg || `Download failed (${errorCode})`);
    }

    const xmlData = payload.Aadhaar_Xml_Data || {};
    return {
      fullName: xmlData.Full_Name,
      dob: xmlData.Dob,
      gender: xmlData.Gender,
      maskedAadhaar: xmlData.Masked_Aadhaar,
      fullAddress: xmlData.Full_Address,
      pincode: xmlData.Zip,
      state: xmlData.Address?.State,
      profileImage: xmlData.Profile_Image,
      xmlUrl: payload.Xml_Url,
      raw: payload,
    };
  } catch (error) {
    console.error("[DigiLocker] Download Error:", error.message);
    throw error;
  }
};
