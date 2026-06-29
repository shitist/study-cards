function normalizeOAuthConfig(value, source = "none") {
  const clientId = typeof value?.clientId === "string" ? value.clientId.trim() : "";
  const clientSecret = typeof value?.clientSecret === "string" ? value.clientSecret.trim() : "";
  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
    source
  };
}

function loadGeneratedConfig() {
  try {
    // @ts-ignore Optional private/self-use generated config may be absent in the public repo.
    return require("./oauth-config.generated.cjs");
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND" && String(error.message).includes("oauth-config.generated.cjs")) {
      return {};
    }
    throw error;
  }
}

function getBundledOAuthConfig(environment = process.env) {
  const environmentConfig = normalizeOAuthConfig(
    {
      clientId: environment.STUDY_CARDS_GOOGLE_CLIENT_ID,
      clientSecret: environment.STUDY_CARDS_GOOGLE_CLIENT_SECRET
    },
    "environment"
  );
  if (environmentConfig.clientId || environmentConfig.clientSecret) return environmentConfig;

  return normalizeOAuthConfig(loadGeneratedConfig(), "generated");
}

function createSettingsPayload(current, themePreference, preserveLegacyOAuth) {
  const normalizedTheme =
    themePreference === "light" || themePreference === "dark" || themePreference === "system"
      ? themePreference
      : "system";
  const payload = { themePreference: normalizedTheme };

  if (preserveLegacyOAuth && current && typeof current === "object") {
    if (typeof current.googleDriveClientId === "string") {
      payload.googleDriveClientId = current.googleDriveClientId;
    }
    if (Object.prototype.hasOwnProperty.call(current, "googleDriveClientSecret")) {
      payload.googleDriveClientSecret = current.googleDriveClientSecret;
    }
  }

  return payload;
}
module.exports = {
  createSettingsPayload,
  getBundledOAuthConfig,
  normalizeOAuthConfig
};
