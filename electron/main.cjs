const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  createEmptyDatabase,
  normalizeDatabase,
  nowIso,
  validateCardDatabaseForSave
} = require("./card-data.cjs");
const {
  DEVICE_FILE_PREFIX,
  LEGACY_DRIVE_FILE_NAME,
  databaseContentEqual,
  deviceSnapshotName,
  escapeDriveQueryLiteral,
  isDriveDataFileName,
  mergeDatabaseSnapshots
} = require("./drive-sync-data.cjs");
const { createOAuthCodeListener } = require("./oauth-listener.cjs");
const { createOperationCoordinator } = require("./operation-coordinator.cjs");
const { normalizeSyncState } = require("./sync-state.cjs");
const { commitSyncPlan, recoverPendingSync } = require("./sync-transaction.cjs");
const { createSettingsPayload, getBundledOAuthConfig } = require("./oauth-config.cjs");
const { createUpdateService } = require("./update-service.cjs");

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const TOKEN_SKEW_MS = 60_000;
const OAUTH_TIMEOUT_MS = 90_000;
const DRIVE_RETRY_ATTEMPTS = 3;
const DRIVE_RETRY_BASE_MS = 300;

app.enableSandbox();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let mainWindow = null;
let databaseWriteBlockReason = "";
let activeOAuthListener = null;
const operationCoordinator = createOperationCoordinator();
const updateService = createUpdateService({ app, autoUpdater, getWindow: () => mainWindow });


function getPaths() {
  const userData = app.getPath("userData");
  return {
    userData,
    data: path.join(userData, "cards.json"),
    settings: path.join(userData, "settings.json"),
    tokens: path.join(userData, "google-auth.json"),
    syncState: path.join(userData, "sync-state.json"),
    syncTransaction: path.join(userData, "sync-transaction.json")
  };
}

async function ensureUserDataDir() {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
}

function safeTimestampForFileName() {
  return nowIso().replace(/[:.]/g, "-");
}

async function backupCorruptJson(filePath) {
  const parsed = path.parse(filePath);
  const backupPath = path.join(parsed.dir, `${parsed.name}.corrupt-${safeTimestampForFileName()}${parsed.ext || ".json"}`);
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

async function readJson(filePath, fallback, options = {}) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return fallback;
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    if (options.backupOnParseError) {
      let backupPath = "";
      try {
        backupPath = await backupCorruptJson(filePath);
      } catch (backupError) {
        const wrapped = Object.assign(
          new Error(`Local data file is corrupt and could not be backed up. Saving is blocked to avoid overwriting it. Original file: ${filePath}. Backup error: ${backupError.message}`),
          { code: "CORRUPT_JSON" }
        );
        throw wrapped;
      }

      const wrapped = Object.assign(
        new Error(`Local data file is corrupt. A backup was created at ${backupPath}. Saving is blocked to avoid overwriting it.`),
        { code: "CORRUPT_JSON", backupPath }
      );
      throw wrapped;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureUserDataDir();
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors and report the original write failure.
    }
    throw error;
  }
}

async function loadDatabase() {
  try {
    const db = normalizeDatabase(await readJson(getPaths().data, createEmptyDatabase(), { backupOnParseError: true }));
    databaseWriteBlockReason = "";
    return db;
  } catch (error) {
    if (error && error.code === "CORRUPT_JSON") {
      databaseWriteBlockReason = error.message;
    }
    throw error;
  }
}

async function saveDatabaseSnapshot(database) {
  const normalized = normalizeDatabase(database);
  await writeJson(getPaths().data, normalized);
  return normalized;
}

async function saveDatabase(database, options = {}) {
  if (options.validate && databaseWriteBlockReason) {
    throw new Error(databaseWriteBlockReason);
  }

  const normalized = options.validate ? validateCardDatabaseForSave(database) : normalizeDatabase(database);
  normalized.lastSavedAt = nowIso();
  return saveDatabaseSnapshot(normalized);
}

async function readSettingsPayload() {
  return readJson(getPaths().settings, {});
}

async function readSettings() {
  const settings = await readSettingsPayload();
  const themePreference =
    settings.themePreference === "light" || settings.themePreference === "dark"
      ? settings.themePreference
      : "system";
  const bundled = getBundledOAuthConfig();

  if (
    bundled.configured &&
    (Object.prototype.hasOwnProperty.call(settings, "googleDriveClientId") ||
      Object.prototype.hasOwnProperty.call(settings, "googleDriveClientSecret"))
  ) {
    await writeJson(getPaths().settings, createSettingsPayload(settings, themePreference, false));
  }

  return { themePreference };
}
async function readLegacyOAuthConfig() {
  const settings = await readSettingsPayload();
  const clientId = typeof settings.googleDriveClientId === "string" ? settings.googleDriveClientId.trim() : "";
  const clientSecret = decryptClientSecret(settings.googleDriveClientSecret);
  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
    source: "legacy-settings"
  };
}

async function getOAuthConfig() {
  const bundled = getBundledOAuthConfig();
  if (bundled.configured || bundled.clientId || bundled.clientSecret) return bundled;
  return readLegacyOAuthConfig();
}

async function saveSettings(settings) {
  const current = await readSettingsPayload();
  const themePreference =
    settings.themePreference === "light" ||
    settings.themePreference === "dark" ||
    settings.themePreference === "system"
      ? settings.themePreference
      : current.themePreference === "light" || current.themePreference === "dark"
        ? current.themePreference
        : "system";
  const bundled = getBundledOAuthConfig();

  await writeJson(
    getPaths().settings,
    createSettingsPayload(current, themePreference, !bundled.configured)
  );
  return { themePreference };
}
function encryptTokenPayload(tokens) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统凭据加密当前不可用，无法安全保存 Google Drive 登录信息。请重启应用并确认正在使用正常的 Windows 用户账户后重试；应用不会以明文保存令牌。");
  }

  return {
    encrypted: true,
    encoding: "base64",
    data: safeStorage.encryptString(JSON.stringify(tokens)).toString("base64")
  };
}

function decryptClientSecret(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (payload.encrypted !== true || payload.encoding !== "base64" || typeof payload.data !== "string") {
    throw new Error("保存的 Google OAuth 客户端密钥格式无效，请重新填写。");
  }

  try {
    return safeStorage.decryptString(Buffer.from(payload.data, "base64"));
  } catch {
    throw new Error("无法解密 Google OAuth 客户端密钥，请重新填写。");
  }
}

function decryptTokenPayload(payload) {
  if (!payload) return null;

  if (payload.encrypted === true) {
    if (payload.encoding !== "base64" || typeof payload.data !== "string") {
      throw new Error("保存的 Google Drive 登录信息格式无效，请断开连接后重新登录。");
    }
    const decrypted = safeStorage.decryptString(Buffer.from(payload.data, "base64"));
    return JSON.parse(decrypted);
  }

  return payload;
}

async function readTokens() {
  const payload = await readJson(getPaths().tokens, null);
  const tokens = decryptTokenPayload(payload);
  if (tokens && payload && payload.encrypted !== true) {
    await saveTokens(tokens);
  }
  return tokens;
}

async function saveTokens(tokens) {
  await writeJson(getPaths().tokens, encryptTokenPayload(tokens));
}

async function clearTokens() {
  try {
    await fs.unlink(getPaths().tokens);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
}

async function readSyncState() {
  return normalizeSyncState(await readJson(getPaths().syncState, {}));
}

async function saveSyncState(state) {
  await writeJson(getPaths().syncState, normalizeSyncState(state));
}

async function readSyncTransaction() {
  return readJson(getPaths().syncTransaction, null);
}

async function saveSyncTransaction(transaction) {
  await writeJson(getPaths().syncTransaction, transaction);
}

async function clearSyncTransaction() {
  try {
    await fs.unlink(getPaths().syncTransaction);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
}

function createWindow() {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const trustedDevServerUrl = !app.isPackaged && isTrustedDevServerUrl(devServerUrl) ? devServerUrl : "";

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#f7f4ee",
    title: "学习卡片",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppNavigation(url, trustedDevServerUrl)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.once("did-finish-load", () => {
    updateService.scheduleStartupCheck();
  });

  if (trustedDevServerUrl) {
    mainWindow.loadURL(trustedDevServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function isTrustedDevServerUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

function isAllowedAppNavigation(value, trustedDevServerUrl) {
  try {
    const url = new URL(value);
    if (url.protocol === "file:") return true;
    if (!trustedDevServerUrl) return false;
    return url.origin === new URL(trustedDevServerUrl).origin;
  } catch {
    return false;
  }
}

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generatePkce() {
  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function exchangeCodeForTokens({ clientId, clientSecret, code, redirectUri, verifier }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Google 登录失败：无法交换访问令牌（HTTP ${response.status}）。${await response.text()}`);
  }

  const tokens = await response.json();
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expiry_date: Date.now() + Number(tokens.expires_in || 3600) * 1000
  };
}

async function refreshAccessToken(oauthConfig, tokens) {
  if (!tokens || !tokens.refresh_token) {
    throw new Error("Google Drive 需要重新登录。没有可用的 refresh token。");
  }

  const body = new URLSearchParams({
    client_id: oauthConfig.clientId,
    client_secret: oauthConfig.clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Google 登录已失效：无法刷新访问令牌（HTTP ${response.status}）。${await response.text()}`);
  }

  const next = await response.json();
  const refreshed = {
    ...tokens,
    access_token: next.access_token,
    token_type: next.token_type || tokens.token_type,
    expiry_date: Date.now() + Number(next.expires_in || 3600) * 1000
  };
  await saveTokens(refreshed);
  return refreshed;
}

async function getValidTokens() {
  const oauthConfig = await getOAuthConfig();
  const tokens = await readTokens();

  if (!oauthConfig.configured) {
    throw new Error("当前版本尚未配置 Google OAuth，请使用带有内置 OAuth 配置的正式构建。");
  }
  if (!tokens || !tokens.access_token) {
    throw new Error("请先登录 Google Drive。");
  }
  if (!tokens.expiry_date || Date.now() + TOKEN_SKEW_MS >= tokens.expiry_date) {
    return refreshAccessToken(oauthConfig, tokens);
  }
  return tokens;
}
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function driveFetch(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const retryable = method === "GET" || method === "PATCH";
  let transientAttempt = 0;
  let tokens = await getValidTokens();
  let authenticationRetried = false;

  while (true) {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: "Bearer " + tokens.access_token
        }
      });
    } catch (error) {
      if (retryable && transientAttempt + 1 < DRIVE_RETRY_ATTEMPTS) {
        await wait(DRIVE_RETRY_BASE_MS * 3 ** transientAttempt);
        transientAttempt += 1;
        continue;
      }
      throw error;
    }

    if (response.status === 401 && !authenticationRetried) {
      const oauthConfig = await getOAuthConfig();
      tokens = await refreshAccessToken(oauthConfig, await readTokens());
      authenticationRetried = true;
      continue;
    }

    if (
      retryable &&
      (response.status === 429 || response.status >= 500) &&
      transientAttempt + 1 < DRIVE_RETRY_ATTEMPTS
    ) {
      await response.arrayBuffer();
      await wait(DRIVE_RETRY_BASE_MS * 3 ** transientAttempt);
      transientAttempt += 1;
      continue;
    }

    if (!response.ok) {
      const details = await response.text();
      const error = new Error(
        "Google Drive 请求失败：HTTP " + response.status + (details ? " - " + details : "")
      );
      throw Object.assign(error, { status: response.status });
    }

    return response;
  }
}
async function listDriveDataFiles() {
  const query = encodeURIComponent(
    "(name='" + escapeDriveQueryLiteral(LEGACY_DRIVE_FILE_NAME) + "' or name contains '" + escapeDriveQueryLiteral(DEVICE_FILE_PREFIX) + "') and trashed=false"
  );
  const fields = encodeURIComponent("nextPageToken,files(id,name,modifiedTime,version,trashed)");
  const orderBy = encodeURIComponent("name");
  const url =
    "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=" + query +
    "&orderBy=" + orderBy + "&pageSize=100&fields=" + fields;
  const response = await driveFetch(url);
  const payload = await response.json();

  return {
    files: Array.isArray(payload.files)
      ? payload.files.filter((file) => file && isDriveDataFileName(file.name) && file.trashed !== true)
      : [],
    hasMore: typeof payload.nextPageToken === "string" && payload.nextPageToken.length > 0
  };
}

async function downloadDriveDatabase(file) {
  try {
    const response = await driveFetch(
      "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media"
    );
    return normalizeDatabase(await response.json());
  } catch (error) {
    throw new Error("无法读取 Google Drive 同步快照 " + file.name + "：" + error.message);
  }
}

async function createDriveDatabase(fileName, database) {
  const boundary = "study-cards-" + crypto.randomUUID();
  const metadata = {
    name: fileName,
    parents: ["appDataFolder"],
    mimeType: "application/json"
  };
  const body = [
    "--" + boundary,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    "--" + boundary,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(database),
    "--" + boundary + "--",
    ""
  ].join("\r\n");

  const fields = encodeURIComponent("id,name,modifiedTime,version");
  const response = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=" + fields,
    {
      method: "POST",
      headers: { "Content-Type": "multipart/related; boundary=" + boundary },
      body
    }
  );
  return response.json();
}

async function updateDriveDatabase(fileId, database) {
  const fields = encodeURIComponent("id,name,modifiedTime,version");
  const response = await driveFetch(
    "https://www.googleapis.com/upload/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?uploadType=media&fields=" +
      fields,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(database)
    }
  );
  return response.json();
}

function assertValidSnapshotListing(listing, ownFileName) {
  if (listing.hasMore) {
    throw new Error("Google Drive 同步快照超过 100 个，本次同步已停止，请先检查远端应用数据。");
  }

  const legacyFiles = listing.files.filter((file) => file.name === LEGACY_DRIVE_FILE_NAME);
  if (legacyFiles.length > 1) {
    throw new Error("Google Drive 私有空间中发现多个 " + LEGACY_DRIVE_FILE_NAME + "，本次同步已停止。");
  }

  const ownFiles = listing.files.filter((file) => file.name === ownFileName);
  if (ownFiles.length > 1) {
    throw new Error("当前设备在 Google Drive 中存在多个同步快照 " + ownFileName + "，本次同步已停止。");
  }

  return ownFiles[0] || null;
}

async function performDriveSync() {
  await recoverPendingSync({
    readTransaction: readSyncTransaction,
    loadLocal: loadDatabase,
    saveLocal: saveDatabaseSnapshot,
    saveState: saveSyncState,
    clearTransaction: clearSyncTransaction,
    nowIso
  });

  const localDb = normalizeDatabase(await loadDatabase());
  const state = await readSyncState();
  const syncStartedAt = nowIso();
  const ownFileName = deviceSnapshotName(localDb.deviceId);
  const listing = await listDriveDataFiles();
  const ownFile = assertValidSnapshotListing(listing, ownFileName);
  const orderedFiles = [...listing.files].sort((left, right) =>
    (left.name + ":" + left.id).localeCompare(right.name + ":" + right.id)
  );

  const downloadedSnapshots = [];
  let ownRemoteDatabase = null;
  for (const file of orderedFiles) {
    const database = await downloadDriveDatabase(file);
    downloadedSnapshots.push(database);
    if (ownFile && file.id === ownFile.id) ownRemoteDatabase = database;
  }

  const merged = mergeDatabaseSnapshots(localDb, downloadedSnapshots, state.lastSyncedAt || null);
  const contentChanged = !databaseContentEqual(localDb, merged.database);
  const nextDb = contentChanged
    ? normalizeDatabase({ ...merged.database, deviceId: localDb.deviceId, lastSavedAt: syncStartedAt })
    : localDb;
  const localChanged = state.lastSyncedLocalSavedAt !== localDb.lastSavedAt;
  const ownSnapshotOutdated = !ownRemoteDatabase || !databaseContentEqual(ownRemoteDatabase, nextDb);
  const shouldUpload = !ownFile || localChanged || contentChanged || ownSnapshotOutdated;

  const committed = await commitSyncPlan(
    {
      localDatabase: localDb,
      nextDatabase: nextDb,
      contentChanged,
      shouldUpload,
      ownFile,
      ownFileName,
      syncStartedAt,
      previousSyncState: state
    },
    {
      saveTransaction: saveSyncTransaction,
      upload: async () => {
        const uploadedMetadata = ownFile
          ? await updateDriveDatabase(ownFile.id, nextDb)
          : await createDriveDatabase(ownFileName, nextDb);

        if (!ownFile) {
          const verifiedListing = await listDriveDataFiles();
          const verifiedOwnFile = assertValidSnapshotListing(verifiedListing, ownFileName);
          if (!verifiedOwnFile || verifiedOwnFile.id !== uploadedMetadata.id) {
            throw new Error("创建当前设备的 Google Drive 同步快照后校验失败，本次同步已停止。");
          }
        }

        return uploadedMetadata;
      },
      saveLocal: saveDatabaseSnapshot,
      saveState: saveSyncState,
      clearTransaction: clearSyncTransaction
    }
  );
  const finalDb = committed.finalDatabase;

  let action = "noop";
  if (merged.conflicts.length > 0) action = "merged-with-conflicts";
  else if (contentChanged && localChanged) action = "merged";
  else if (contentChanged) action = "downloaded";
  else if (shouldUpload) action = "uploaded";

  return {
    action,
    database: finalDb,
    conflicts: merged.conflicts.length,
    message: merged.conflicts.length > 0 ? "同步完成，并保留了冲突副本。" : "同步完成。"
  };
}
async function getDriveStatus() {
  const oauthConfig = await getOAuthConfig();
  const tokens = await readTokens();
  const syncState = await readSyncState();
  return {
    configured: oauthConfig.configured,
    signedIn: Boolean(tokens && tokens.refresh_token),
    lastSyncedAt: syncState.lastSyncedAt || null
  };
}
ipcMain.handle("cards:load", async () => loadDatabase());
ipcMain.handle("cards:save", async (_event, database) =>
  operationCoordinator.runSave(() => saveDatabase(database, { validate: true }))
);
ipcMain.handle("cards:getStorageInfo", async () => ({ dataPath: getPaths().data, userDataPath: getPaths().userData }));
ipcMain.handle("settings:load", async () => readSettings());
ipcMain.handle("settings:save", async (_event, settings) => saveSettings(settings));
ipcMain.handle("drive:status", async () => getDriveStatus());
ipcMain.handle("drive:signIn", async () => {
  const oauthConfig = await getOAuthConfig();
  if (!oauthConfig.configured) {
    throw new Error("\u5f53\u524d\u7248\u672c\u672a\u914d\u7f6e Google OAuth\uff0c\u8bf7\u4f7f\u7528\u5e26\u6709\u5185\u7f6e OAuth \u914d\u7f6e\u7684\u6b63\u5f0f\u6784\u5efa\u3002");
  }

  if (activeOAuthListener) {
    activeOAuthListener.cancel("Google Drive \u767b\u5f55\u5df2\u53d6\u6d88\u3002");
  }

  const { verifier, challenge } = generatePkce();
  const state = crypto.randomUUID();
  const listener = await createOAuthCodeListener(state, { timeoutMs: OAUTH_TIMEOUT_MS });
  activeOAuthListener = listener;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", oauthConfig.clientId);
  authUrl.searchParams.set("redirect_uri", listener.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DRIVE_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  try {
    await shell.openExternal(authUrl.toString());
    const code = await listener.codePromise;
    const tokens = await exchangeCodeForTokens({
      clientId: oauthConfig.clientId,
      clientSecret: oauthConfig.clientSecret,
      code,
      redirectUri: listener.redirectUri,
      verifier
    });
    await saveTokens(tokens);
    return getDriveStatus();
  } finally {
    if (activeOAuthListener === listener) activeOAuthListener = null;
  }
});
ipcMain.handle("drive:cancelSignIn", async () => {
  if (!activeOAuthListener) return { cancelled: false };
  activeOAuthListener.cancel("Google Drive \u767b\u5f55\u5df2\u53d6\u6d88\u3002");
  activeOAuthListener = null;
  return { cancelled: true };
});
ipcMain.handle("drive:signOut", async () => {
  await clearTokens();
  return getDriveStatus();
});
ipcMain.handle("drive:sync", async () =>
  operationCoordinator.runSync(() => performDriveSync())
);
ipcMain.handle("updates:getStatus", async () => updateService.getStatus());
ipcMain.handle("updates:check", async () => updateService.checkForUpdates());
ipcMain.handle("updates:download", async () => updateService.downloadUpdate());
ipcMain.handle("updates:install", async () => updateService.quitAndInstall());

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(createWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("before-quit", () => {
    if (activeOAuthListener) activeOAuthListener.cancel("Google Drive \u767b\u5f55\u5df2\u53d6\u6d88\u3002");
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
