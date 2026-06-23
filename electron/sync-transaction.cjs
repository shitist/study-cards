const { normalizeDatabase, nowIso } = require("./card-data.cjs");
const { databaseContentEqual, mergeDatabaseSnapshots } = require("./drive-sync-data.cjs");
const { normalizeSyncState } = require("./sync-state.cjs");

function normalizeRemoteMetadata(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id) return null;
  return {
    id: value.id,
    version:
      typeof value.version === "string"
        ? value.version
        : Number.isFinite(value.version)
          ? String(value.version)
          : null
  };
}

function normalizeSyncTransaction(value) {
  if (!value || typeof value !== "object" || value.version !== 1) return null;
  if (value.phase !== "prepared" && value.phase !== "remote-committed") return null;
  if (typeof value.syncStartedAt !== "string" || !Number.isFinite(Date.parse(value.syncStartedAt))) return null;

  return {
    version: 1,
    phase: value.phase,
    syncStartedAt: value.syncStartedAt,
    previousSyncState: normalizeSyncState(value.previousSyncState),
    previousLocalSavedAt:
      typeof value.previousLocalSavedAt === "string" ? value.previousLocalSavedAt : null,
    nextDatabase: normalizeDatabase(value.nextDatabase),
    ownFileName: typeof value.ownFileName === "string" ? value.ownFileName : "",
    remoteMetadata: normalizeRemoteMetadata(value.remoteMetadata)
  };
}

async function commitSyncPlan(plan, io) {
  const prepared = {
    version: 1,
    phase: "prepared",
    syncStartedAt: plan.syncStartedAt,
    previousSyncState: normalizeSyncState(plan.previousSyncState),
    previousLocalSavedAt: plan.localDatabase.lastSavedAt,
    nextDatabase: normalizeDatabase(plan.nextDatabase),
    ownFileName: plan.ownFileName,
    remoteMetadata: normalizeRemoteMetadata(plan.ownFile)
  };
  await io.saveTransaction(prepared);

  const uploadedMetadata = plan.shouldUpload ? await io.upload() : plan.ownFile;
  const remoteMetadata = normalizeRemoteMetadata(uploadedMetadata);
  if (!remoteMetadata) {
    throw new Error("Google Drive 同步完成后缺少远端文件元数据。");
  }

  const committed = {
    ...prepared,
    phase: "remote-committed",
    remoteMetadata
  };
  await io.saveTransaction(committed);

  const finalDatabase = plan.contentChanged
    ? await io.saveLocal(prepared.nextDatabase)
    : normalizeDatabase(plan.localDatabase);
  const nextState = normalizeSyncState({
    syncModeVersion: 2,
    remoteFileId: remoteMetadata.id,
    remoteVersion: remoteMetadata.version,
    lastSyncedAt: plan.syncStartedAt,
    lastSyncedLocalSavedAt: finalDatabase.lastSavedAt
  });
  await io.saveState(nextState);
  await io.clearTransaction();

  return {
    finalDatabase,
    uploadedMetadata: {
      ...uploadedMetadata,
      id: remoteMetadata.id,
      version: remoteMetadata.version
    },
    nextState
  };
}

async function recoverPendingSync(io) {
  const rawTransaction = await io.readTransaction();
  if (!rawTransaction) return { recovered: false, database: null };

  const transaction = normalizeSyncTransaction(rawTransaction);
  if (!transaction) {
    await io.clearTransaction();
    return { recovered: false, database: null };
  }

  if (transaction.phase === "prepared") {
    await io.clearTransaction();
    return { recovered: false, database: null };
  }

  if (!transaction.remoteMetadata) {
    throw new Error("同步恢复记录缺少远端文件元数据。");
  }

  const currentDatabase = normalizeDatabase(await io.loadLocal());
  const intendedDatabase = transaction.nextDatabase;
  let recoveredDatabase = currentDatabase;

  if (!databaseContentEqual(currentDatabase, intendedDatabase)) {
    const merged = mergeDatabaseSnapshots(
      currentDatabase,
      [intendedDatabase],
      transaction.previousSyncState.lastSyncedAt
    );
    recoveredDatabase = normalizeDatabase({
      ...merged.database,
      deviceId: currentDatabase.deviceId,
      lastSavedAt: io.nowIso ? io.nowIso() : nowIso()
    });
    recoveredDatabase = await io.saveLocal(recoveredDatabase);
  }

  const localMatchesRemote = databaseContentEqual(recoveredDatabase, intendedDatabase);
  const recoveredState = normalizeSyncState({
    syncModeVersion: 2,
    remoteFileId: transaction.remoteMetadata.id,
    remoteVersion: transaction.remoteMetadata.version,
    lastSyncedAt: transaction.syncStartedAt,
    lastSyncedLocalSavedAt: localMatchesRemote
      ? recoveredDatabase.lastSavedAt
      : intendedDatabase.lastSavedAt
  });
  await io.saveState(recoveredState);
  await io.clearTransaction();

  return {
    recovered: true,
    database: recoveredDatabase,
    state: recoveredState
  };
}

module.exports = {
  commitSyncPlan,
  normalizeSyncTransaction,
  recoverPendingSync
};
