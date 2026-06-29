const UPDATE_STATUS_CHANNEL = "updates:status";

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createUpdateService({ app, autoUpdater, getWindow, delayMs = 12_000 }) {
  let wired = false;
  let startupCheckScheduled = false;
  let status = {
    status: "idle",
    currentVersion: app.getVersion(),
    version: null,
    percent: null,
    error: null
  };

  function snapshot() {
    return { ...status, currentVersion: app.getVersion() };
  }

  function emit(nextStatus) {
    status = { ...status, ...nextStatus, currentVersion: app.getVersion() };
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(UPDATE_STATUS_CHANNEL, snapshot());
    }
    return snapshot();
  }

  function unavailableStatus() {
    return emit({
      status: "unavailable",
      version: null,
      percent: null,
      error: "\u5f00\u53d1\u6a21\u5f0f\u4e0d\u652f\u6301\u81ea\u52a8\u66f4\u65b0\uff0c\u8bf7\u4f7f\u7528\u5b89\u88c5\u7248\u6d4b\u8bd5\u3002"
    });
  }

  function ensureWired() {
    if (wired) return;
    wired = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
      emit({ status: "checking", percent: null, error: null });
    });

    autoUpdater.on("update-available", (info) => {
      emit({ status: "available", version: info?.version || null, percent: null, error: null });
    });

    autoUpdater.on("update-not-available", () => {
      emit({ status: "not-available", version: null, percent: null, error: null });
    });

    autoUpdater.on("download-progress", (progress) => {
      emit({
        status: "downloading",
        percent: typeof progress?.percent === "number" ? progress.percent : null,
        error: null
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      emit({ status: "downloaded", version: info?.version || status.version, percent: 100, error: null });
    });

    autoUpdater.on("error", (error) => {
      emit({ status: "error", percent: null, error: errorMessage(error) });
    });
  }

  async function checkForUpdates() {
    if (!app.isPackaged) return unavailableStatus();
    ensureWired();
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      emit({ status: "error", percent: null, error: errorMessage(error) });
    }
    return snapshot();
  }

  async function downloadUpdate() {
    if (!app.isPackaged) return unavailableStatus();
    ensureWired();
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      emit({ status: "error", percent: null, error: errorMessage(error) });
    }
    return snapshot();
  }

  function quitAndInstall() {
    if (status.status !== "downloaded") {
      throw new Error("\u66f4\u65b0\u8fd8\u672a\u4e0b\u8f7d\u5b8c\u6210\u3002");
    }
    autoUpdater.quitAndInstall(false, true);
    return snapshot();
  }

  function scheduleStartupCheck() {
    if (startupCheckScheduled || !app.isPackaged) return;
    startupCheckScheduled = true;
    const timer = setTimeout(() => {
      void checkForUpdates();
    }, delayMs);
    if (typeof timer.unref === "function") timer.unref();
  }

  return {
    channel: UPDATE_STATUS_CHANNEL,
    getStatus: snapshot,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
    scheduleStartupCheck
  };
}

module.exports = { UPDATE_STATUS_CHANNEL, createUpdateService };