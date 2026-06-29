const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createUpdateService } = require("./update-service.cjs");

function createFakeUpdater() {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => undefined;
  updater.downloadUpdate = async () => undefined;
  updater.quitAndInstallCalls = [];
  updater.quitAndInstall = (...args) => {
    updater.quitAndInstallCalls.push(args);
  };
  return updater;
}

function createFakeWindow(events) {
  return {
    isDestroyed: () => false,
    webContents: {
      send: (channel, payload) => events.push({ channel, payload })
    }
  };
}

test("update service reports unavailable in development mode", async () => {
  const updater = createFakeUpdater();
  const events = [];
  const service = createUpdateService({
    app: { isPackaged: false, getVersion: () => "0.1.0" },
    autoUpdater: updater,
    getWindow: () => createFakeWindow(events)
  });

  const status = await service.checkForUpdates();
  assert.equal(status.status, "unavailable");
  assert.equal(status.currentVersion, "0.1.0");
  assert.match(status.error, /\u5f00\u53d1\u6a21\u5f0f|开发模式/);
});

test("update service emits update-available status from updater events", async () => {
  const updater = createFakeUpdater();
  updater.checkForUpdates = async () => {
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "0.2.0" });
  };
  const events = [];
  const service = createUpdateService({
    app: { isPackaged: true, getVersion: () => "0.1.0" },
    autoUpdater: updater,
    getWindow: () => createFakeWindow(events)
  });

  const status = await service.checkForUpdates();
  assert.equal(status.status, "available");
  assert.equal(status.version, "0.2.0");
  assert.equal(events.at(-1).channel, "updates:status");
  assert.equal(events.at(-1).payload.status, "available");
});

test("update service installs only after an update has downloaded", async () => {
  const updater = createFakeUpdater();
  const events = [];
  const service = createUpdateService({
    app: { isPackaged: true, getVersion: () => "0.1.0" },
    autoUpdater: updater,
    getWindow: () => createFakeWindow(events)
  });

  assert.throws(() => service.quitAndInstall(), /\u66f4\u65b0|更新/);
  await service.checkForUpdates();
  updater.emit("update-downloaded", { version: "0.2.0" });
  const status = service.quitAndInstall();

  assert.equal(status.status, "downloaded");
  assert.deepEqual(updater.quitAndInstallCalls, [[false, true]]);
});