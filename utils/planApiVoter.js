const DEFAULT_VOTER_VERIFY_URL = "https://planapi.in/Api/Ekyc/VoterIdVerification";

const getPlanApiConfig = () => {
  const tokenId = process.env.PLANAPI_TOKEN_ID?.trim();
  const apiUserId = process.env.PLANAPI_USER_ID?.trim();
  const apiPassword = process.env.PLANAPI_PASSWORD?.trim();

  if (!tokenId || !apiUserId || !apiPassword) {
    throw new Error("Voter ID verification service is not configured");
  }

  return {
    tokenId,
    apiUserId,
    apiPassword,
    apiMode: process.env.PLANAPI_MODE?.trim() || "0",
    verifyUrl: process.env.PLANAPI_VOTER_VERIFY_URL?.trim() || DEFAULT_VOTER_VERIFY_URL,
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

const verifyVoterWithPlanApi = async (voterId) => {
  const config = getPlanApiConfig();
  const testMode = config.apiMode !== "1";

  const body = new URLSearchParams({
    VoterId: voterId.trim().toUpperCase(),
    ApiMode: config.apiMode,
  });

  const response = await fetch(config.verifyUrl, {
    method: "POST",
    headers: buildHeaders(config),
    body,
  });

  const { payload, raw } = await parseProviderResponse(response);
  const message = getProviderMessage(payload);

  const isSuccess = isProviderSuccess(payload);

  if (!isSuccess) {
    throw new Error(
      message || `Failed to verify Voter ID (HTTP ${response.status})`,
    );
  }

  return {
    message: message || "Voter ID verified successfully",
    providerResponse: payload || raw,
    epicNo: payload?.response?.epic_no || null,
    holderName: payload?.response?.holder_name || null,
    dob: payload?.response?.dob || null,
    gender: payload?.response?.gender || null,
    relation: payload?.response?.relation || null,
    relationType: payload?.response?.relation_type || null,
    area: payload?.response?.area || null,
    district: payload?.response?.district || null,
    testMode,
    apiMode: config.apiMode,
  };
};

export { verifyVoterWithPlanApi };
