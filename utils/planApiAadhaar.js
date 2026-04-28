const DEFAULT_SEND_OTP_URL = "https://planapi.in/Api/Ekyc/AdharVerification";
const DEFAULT_VERIFY_OTP_URL =
  "https://planapi.in/Api/Ekyc/AdharVerificationSubmitOtp";

const getPlanApiConfig = () => {
  const tokenId = process.env.PLANAPI_TOKEN_ID?.trim();
  const apiUserId = process.env.PLANAPI_USER_ID?.trim();
  const apiPassword = process.env.PLANAPI_PASSWORD?.trim();

  if (!tokenId || !apiUserId || !apiPassword) {
    throw new Error("Aadhaar verification service is not configured");
  }

  return {
    tokenId,
    apiUserId,
    apiPassword,
    apiMode: process.env.PLANAPI_MODE?.trim() || "0",
    sendOtpUrl:
      process.env.PLANAPI_AADHAAR_SEND_OTP_URL?.trim() || DEFAULT_SEND_OTP_URL,
    verifyOtpUrl:
      process.env.PLANAPI_AADHAAR_VERIFY_OTP_URL?.trim() ||
      DEFAULT_VERIFY_OTP_URL,
  };
};

const buildHeaders = (config) => ({
  TokenID: config.tokenId,
  ApiUserID: config.apiUserId,
  ApiPassword: config.apiPassword,
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "application/json",
});

const parseProviderResponse = async (response) => {
  const raw = await response.text();

  try {
    return {
      payload: JSON.parse(raw),
      raw,
    };
  } catch (error) {
    return {
      payload: null,
      raw,
    };
  }
};

const getProviderMessage = (payload) => {
  if (!payload) return "";

  return (
    payload?.msg ||
    payload?.Msg ||
    payload?.response?.message ||
    payload?.response?.msg ||
    payload?.responce?.message ||
    payload?.responce?.msg ||
    payload?.response?.error ||
    payload?.responce?.error ||
    payload?.message ||
    payload?.error ||
    payload?.Error ||
    ""
  );
};

const getRefId = (payload) => {
  return (
    payload?.response?.ref_id ||
    payload?.response?.refId ||
    payload?.responce?.ref_id ||
    payload?.responce?.refId ||
    payload?.ref_id ||
    payload?.refId ||
    null
  );
};

const isProviderSuccess = (payload) => {
  if (!payload) return false;

  const status = String(payload?.status || "").toLowerCase();
  const code = Number(
    payload?.code ??
      payload?.Errorcode ??
      payload?.ErrorCode ??
      payload?.errorcode ??
      payload?.statusCode,
  );

  if (status === "success") return true;
  if ([100, 200, 211].includes(code)) return true;

  return false;
};

const sendAadhaarOtpWithPlanApi = async (aadhaarNumber) => {
  const config = getPlanApiConfig();
  const testMode = config.apiMode !== "1";

  const body = new URLSearchParams({
    Aadhaarid: aadhaarNumber,
    ApiMode: config.apiMode,
    IsRofferAmountFetch: "No", // Default to No to save hits (1 hit instead of 3)
  });

  const response = await fetch(config.sendOtpUrl, {
    method: "POST",
    headers: buildHeaders(config),
    body,
  });

  const { payload, raw } = await parseProviderResponse(response);
  const message = getProviderMessage(payload);

  if (!response.ok || !isProviderSuccess(payload)) {
    throw new Error(
      message || `Failed to send Aadhaar OTP (HTTP ${response.status})`,
    );
  }

  const refId = getRefId(payload);
  if (!refId) {
    throw new Error(
      "Provider did not return reference ID for OTP verification",
    );
  }

  return {
    refId,
    message:
      message ||
      (testMode ?
        "PlanAPI is in test mode. Real OTP SMS is not delivered in test mode. Set PLANAPI_MODE=1 for live OTP delivery."
      : "OTP has been sent"),
    providerResponse: payload || raw,
    testMode,
    apiMode: config.apiMode,
  };
};

const verifyAadhaarOtpWithPlanApi = async ({ aadhaarNumber, refId, otp }) => {
  const config = getPlanApiConfig();

  // PlanAPI docs require Aadhaarid, OTP, ReqId and ApiMode.
  const body = new URLSearchParams({
    Aadhaarid: aadhaarNumber,
    OTP: otp,
    ReqId: refId,
    ApiMode: config.apiMode,
    IsRofferAmountFetch: "No",
  });

  const response = await fetch(config.verifyOtpUrl, {
    method: "POST",
    headers: buildHeaders(config),
    body,
  });

  const { payload, raw } = await parseProviderResponse(response);
  const message = getProviderMessage(payload);

  if (!response.ok || !isProviderSuccess(payload)) {
    throw new Error(
      message || `Failed to verify Aadhaar OTP (HTTP ${response.status})`,
    );
  }

  return {
    message: message || "Aadhaar verified successfully",
    providerResponse: payload || raw,
  };
};

export { sendAadhaarOtpWithPlanApi, verifyAadhaarOtpWithPlanApi };
