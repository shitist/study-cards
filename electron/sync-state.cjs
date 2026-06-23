function validTimestamp(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function normalizeSyncState(value) {
  const state = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const remoteVersion =
    typeof state.remoteVersion === "string"
      ? state.remoteVersion
      : Number.isFinite(state.remoteVersion)
        ? String(state.remoteVersion)
        : null;

  return {
    syncModeVersion: state.syncModeVersion === 2 ? 2 : null,
    remoteFileId: typeof state.remoteFileId === "string" && state.remoteFileId ? state.remoteFileId : null,
    remoteVersion,
    lastSyncedAt: validTimestamp(state.lastSyncedAt) ? state.lastSyncedAt : null,
    lastSyncedLocalSavedAt: validTimestamp(state.lastSyncedLocalSavedAt)
      ? state.lastSyncedLocalSavedAt
      : null
  };
}

module.exports = { normalizeSyncState };
