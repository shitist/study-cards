const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const {
  createEmptyDatabase,
  mergeDatabases,
  normalizeDatabase,
  nowIso,
  validateCardDatabaseForSave
} = require("./card-data.cjs");

const DRIVE_FILE_NAME = "study-cards-data.json";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const TOKEN_SKEW_MS = 60_000;
const OAUTH_TIMEOUT_MS = 180_000;

app.enableSandbox();

let mainWindow = null;
let databaseWriteBlockReason = "";
let syncInFlight = null;


function getPaths() {
  const userData = app.getPath("userData");
  return {
    userData,
    data: path.join(userData, "cards.json"),
    settings: path.join(userData, "settings.json"),
    tokens: path.join(userData, "google-auth.json"),
    syncState: path.join(userData, "sync-state.json")
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
    if (error && error.code === "ENOENT") return fallback;
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
        const wrapped = new Error(`Local data file is corrupt and could not be backed up. Saving is blocked to avoid overwriting it. Original file: ${filePath}. Backup error: ${backupError.message}`);
        wrapped.code = "CORRUPT_JSON";
        throw wrapped;
      }

      const wrapped = new Error(`Local data file is corrupt. A backup was created at ${backupPath}. Saving is blocked to avoid overwriting it.`);
      wrapped.code = "CORRUPT_JSON";
      wrapped.backupPath = backupPath;
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

async function readSettings() {
  const settings = await readJson(getPaths().settings, {});
  return {
    googleDriveClientId: typeof settings.googleDriveClientId === "string" ? settings.googleDriveClientId : "",
    syncEnabled: Boolean(settings.syncEnabled),
    themePreference: settings.themePreference === "light" || settings.themePreference === "dark" ? settings.themePreference : "system"
  };
}

async function saveSettings(settings) {
  const current = await readSettings();
  const next = {
    ...current,
    ...settings,
    googleDriveClientId: typeof settings.googleDriveClientId === "string" ? settings.googleDriveClientId.trim() : current.googleDriveClientId,
    syncEnabled: typeof settings.syncEnabled === "boolean" ? settings.syncEnabled : current.syncEnabled,
    themePreference: settings.themePreference === "light" || settings.themePreference === "dark" || settings.themePreference === "system" ? settings.themePreference : current.themePreference
  };
  await writeJson(getPaths().settings, next);
  return next;
}

function encryptTokenPayload(tokens) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("System credential encryption is unavailable. Google Drive login was not saved.");
  }

  return {
    encrypted: true,
    encoding: "base64",
    data: safeStorage.encryptString(JSON.stringify(tokens)).toString("base64")
  };
}

function decryptTokenPayload(payload) {
  if (!payload) return null;

  if (payload.encrypted === true) {
    if (payload.encoding !== "base64" || typeof payload.data !== "string") {
      throw new Error("Stored Google Drive credentials are invalid.");
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
  return readJson(getPaths().syncState, {});
}

async function saveSyncState(state) {
  await writeJson(getPaths().syncState, state);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#f7f4ee",
    title: "学习卡片",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
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

async function createOAuthCodeListener(expectedState) {
  let settled = false;
  let timeout = null;
  let finish = null;

  const server = http.createServer((request, response) => {
    try {
      const address = server.address();
      const redirectUri = `http://127.0.0.1:${address.port}`;
      const requestUrl = new URL(request.url, redirectUri);
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      if (error) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<h1>Google Drive login failed</h1><p>You can close this window.</p>");
        finish(new Error(error));
        return;
      }

      if (!code || state !== expectedState) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<h1>Invalid login response</h1><p>You can close this window.</p>");
        finish(new Error("OAuth response was missing code or had invalid state."));
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<h1>Google Drive connected</h1><p>You can return to the study card app.</p>");
      finish(null, code);
    } catch (error) {
      finish(error);
    }
  });

  const codePromise = new Promise((resolve, reject) => {
    finish = (error, code) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      server.close(() => (error ? reject(error) : resolve(code)));
    };
    server.on("error", (error) => finish(error));
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}`;
  timeout = setTimeout(() => {
    finish(new Error("Google Drive login timed out. Please try again."));
  }, OAUTH_TIMEOUT_MS);
  if (typeof timeout.unref === "function") timeout.unref();

  return { redirectUri, codePromise };
}

async function exchangeCodeForTokens({ clientId, code, redirectUri, verifier }) {
  const body = new URLSearchParams({
    client_id: clientId,
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
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
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

async function refreshAccessToken(settings, tokens) {
  if (!tokens || !tokens.refresh_token) {
    throw new Error("Google Drive 需要重新登录。没有可用的 refresh token。");
  }

  const body = new URLSearchParams({
    client_id: settings.googleDriveClientId,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status} ${await response.text()}`);
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
  const settings = await readSettings();
  const tokens = await readTokens();

  if (!settings.googleDriveClientId) {
    throw new Error("请先填写 Google OAuth Client ID。");
  }
  if (!tokens || !tokens.access_token) {
    throw new Error("请先登录 Google Drive。");
  }
  if (!tokens.expiry_date || Date.now() + TOKEN_SKEW_MS >= tokens.expiry_date) {
    return refreshAccessToken(settings, tokens);
  }
  return tokens;
}

async function driveFetch(url, options = {}) {
  let tokens = await getValidTokens();
  let response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${tokens.access_token}`
    }
  });

  if (response.status === 401) {
    const settings = await readSettings();
    tokens = await refreshAccessToken(settings, await readTokens());
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
  }

  if (!response.ok) {
    throw new Error(`Google Drive request failed: ${response.status} ${await response.text()}`);
  }

  return response;
}

async function findDriveDataFile() {
  const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const fields = encodeURIComponent("files(id,name,modifiedTime,version)");
  const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=${fields}`;
  const response = await driveFetch(url);
  const payload = await response.json();
  return Array.isArray(payload.files) && payload.files.length > 0 ? payload.files[0] : null;
}

async function downloadDriveDatabase(fileId) {
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return normalizeDatabase(await response.json());
}

async function createDriveDatabase(database) {
  const boundary = `study-cards-${crypto.randomUUID()}`;
  const metadata = {
    name: DRIVE_FILE_NAME,
    parents: ["appDataFolder"],
    mimeType: "application/json"
  };
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(database),
    `--${boundary}--`,
    ""
  ].join("\r\n");

  const fields = encodeURIComponent("id,modifiedTime,version");
  const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  return response.json();
}

async function updateDriveDatabase(fileId, database) {
  const fields = encodeURIComponent("id,modifiedTime,version");
  const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=${fields}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(database)
  });
  return response.json();
}

async function performDriveSync() {
  const localDb = normalizeDatabase(await loadDatabase());
  const state = await readSyncState();
  const remoteFile = await findDriveDataFile();
  const syncStartedAt = nowIso();

  if (!remoteFile) {
    const created = await createDriveDatabase(localDb);
    await saveSyncState({
      remoteFileId: created.id,
      remoteVersion: created.version,
      lastSyncedAt: syncStartedAt,
      lastSyncedLocalSavedAt: localDb.lastSavedAt
    });
    return { action: "uploaded", database: localDb, conflicts: 0, message: "已创建 Google Drive 同步文件。" };
  }

  const remoteDb = await downloadDriveDatabase(remoteFile.id);
  const hasPreviousSync = Boolean(state.remoteVersion || state.lastSyncedAt);
  const localChanged = state.lastSyncedLocalSavedAt !== localDb.lastSavedAt;
  const remoteChanged = state.remoteVersion !== remoteFile.version;

  let nextDb = localDb;
  let action = "noop";
  let conflicts = 0;
  let uploadedMetadata = remoteFile;
  let shouldSaveLocal = false;

  if (!hasPreviousSync) {
    if (localDb.cards.length === 0 && remoteDb.cards.length > 0) {
      nextDb = normalizeDatabase({ ...remoteDb, lastSavedAt: syncStartedAt });
      shouldSaveLocal = true;
      action = "downloaded";
    } else if (remoteDb.cards.length === 0 && localDb.cards.length > 0) {
      uploadedMetadata = await updateDriveDatabase(remoteFile.id, localDb);
      action = "uploaded";
    } else {
      const merged = mergeDatabases(localDb, remoteDb, state.lastSyncedAt);
      nextDb = normalizeDatabase({ ...merged.database, lastSavedAt: syncStartedAt });
      uploadedMetadata = await updateDriveDatabase(remoteFile.id, nextDb);
      shouldSaveLocal = true;
      conflicts = merged.conflicts.length;
      action = conflicts > 0 ? "merged-with-conflicts" : "merged";
    }
  } else if (localChanged && !remoteChanged) {
    uploadedMetadata = await updateDriveDatabase(remoteFile.id, localDb);
    action = "uploaded";
  } else if (!localChanged && remoteChanged) {
    nextDb = normalizeDatabase({ ...remoteDb, lastSavedAt: syncStartedAt });
    shouldSaveLocal = true;
    action = "downloaded";
  } else if (localChanged && remoteChanged) {
    const merged = mergeDatabases(localDb, remoteDb, state.lastSyncedAt);
    nextDb = normalizeDatabase({ ...merged.database, lastSavedAt: syncStartedAt });
    uploadedMetadata = await updateDriveDatabase(remoteFile.id, nextDb);
    shouldSaveLocal = true;
    conflicts = merged.conflicts.length;
    action = conflicts > 0 ? "merged-with-conflicts" : "merged";
  }

  if (shouldSaveLocal) {
    nextDb = await saveDatabaseSnapshot(nextDb);
  }

  await saveSyncState({
    remoteFileId: remoteFile.id,
    remoteVersion: uploadedMetadata.version || remoteFile.version,
    lastSyncedAt: syncStartedAt,
    lastSyncedLocalSavedAt: nextDb.lastSavedAt
  });

  return {
    action,
    database: nextDb,
    conflicts,
    message: conflicts > 0 ? "同步完成，并保留了冲突副本。" : "同步完成。"
  };
}

async function getDriveStatus() {
  const settings = await readSettings();
  const tokens = await readTokens();
  const syncState = await readSyncState();
  return {
    configured: Boolean(settings.googleDriveClientId),
    signedIn: Boolean(tokens && tokens.refresh_token),
    syncEnabled: settings.syncEnabled,
    lastSyncedAt: syncState.lastSyncedAt || null
  };
}

ipcMain.handle("cards:load", async () => loadDatabase());
ipcMain.handle("cards:save", async (_event, database) => saveDatabase(database, { validate: true }));
ipcMain.handle("cards:getStorageInfo", async () => ({ dataPath: getPaths().data, userDataPath: getPaths().userData }));
ipcMain.handle("settings:load", async () => readSettings());
ipcMain.handle("settings:save", async (_event, settings) => saveSettings(settings));
ipcMain.handle("drive:status", async () => getDriveStatus());
ipcMain.handle("drive:signIn", async () => {
  const settings = await readSettings();
  if (!settings.googleDriveClientId) {
    throw new Error("请先填写 Google OAuth Client ID。");
  }

  const { verifier, challenge } = generatePkce();
  const state = crypto.randomUUID();
  const { redirectUri, codePromise } = await createOAuthCodeListener(state);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", settings.googleDriveClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", DRIVE_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  await shell.openExternal(authUrl.toString());
  const code = await codePromise;
  const tokens = await exchangeCodeForTokens({ clientId: settings.googleDriveClientId, code, redirectUri, verifier });
  await saveTokens(tokens);
  await saveSettings({ syncEnabled: true });
  return getDriveStatus();
});
ipcMain.handle("drive:signOut", async () => {
  await clearTokens();
  await saveSettings({ syncEnabled: false });
  return getDriveStatus();
});
ipcMain.handle("drive:sync", async () => {
  if (syncInFlight) return syncInFlight;
  syncInFlight = performDriveSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
});

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
