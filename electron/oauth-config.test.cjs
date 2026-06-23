const assert = require("node:assert/strict");
const test = require("node:test");
const { createSettingsPayload, getBundledOAuthConfig, normalizeOAuthConfig } = require("./oauth-config.cjs");

test("normalizeOAuthConfig trims credentials and reports configured state", () => {
  assert.deepEqual(normalizeOAuthConfig({ clientId: " id ", clientSecret: " secret " }, "test"), {
    clientId: "id",
    clientSecret: "secret",
    configured: true,
    source: "test"
  });
});

test("environment OAuth config takes precedence without exposing it to renderer settings", () => {
  const config = getBundledOAuthConfig({
    STUDY_CARDS_GOOGLE_CLIENT_ID: "client-id",
    STUDY_CARDS_GOOGLE_CLIENT_SECRET: "client-secret"
  });
  assert.equal(config.configured, true);
  assert.equal(config.source, "environment");
  assert.equal(config.clientId, "client-id");
  assert.equal(config.clientSecret, "client-secret");
});

test("createSettingsPayload removes legacy credentials only after bundled config is available", () => {
  const current = {
    themePreference: "light",
    googleDriveClientId: "legacy-id",
    googleDriveClientSecret: { encrypted: true, data: "ciphertext" },
    ignored: true
  };

  assert.deepEqual(createSettingsPayload(current, "dark", false), {
    themePreference: "dark"
  });
  assert.deepEqual(createSettingsPayload(current, "dark", true), {
    themePreference: "dark",
    googleDriveClientId: "legacy-id",
    googleDriveClientSecret: { encrypted: true, data: "ciphertext" }
  });
});
