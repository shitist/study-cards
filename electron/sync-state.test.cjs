const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeSyncState } = require("./sync-state.cjs");

test("normalizeSyncState rejects unknown and malformed values", () => {
  assert.deepEqual(normalizeSyncState({
    syncModeVersion: "2",
    remoteFileId: 42,
    remoteVersion: {},
    lastSyncedAt: "not-a-date",
    lastSyncedLocalSavedAt: []
  }), {
    syncModeVersion: null,
    remoteFileId: null,
    remoteVersion: null,
    lastSyncedAt: null,
    lastSyncedLocalSavedAt: null
  });
});

test("normalizeSyncState keeps the supported canonical fields", () => {
  assert.deepEqual(normalizeSyncState({
    syncModeVersion: 2,
    remoteFileId: "file-1",
    remoteVersion: 7,
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    lastSyncedLocalSavedAt: "2026-01-02T00:00:00.000Z",
    ignored: true
  }), {
    syncModeVersion: 2,
    remoteFileId: "file-1",
    remoteVersion: "7",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    lastSyncedLocalSavedAt: "2026-01-02T00:00:00.000Z"
  });
});
