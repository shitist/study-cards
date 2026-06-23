const crypto = require("node:crypto");
const { mergeDatabases, normalizeDatabase, stableStringify } = require("./card-data.cjs");

const LEGACY_DRIVE_FILE_NAME = "study-cards-data.json";
const DEVICE_FILE_PREFIX = "study-cards-device-";
const DEVICE_FILE_SUFFIX = ".json";

function escapeDriveQueryLiteral(value) {
  const backslash = String.fromCharCode(92);
  return String(value)
    .split(backslash)
    .join(backslash + backslash)
    .split("'")
    .join(backslash + "'");
}
function deviceSnapshotName(deviceId) {
  const digest = crypto.createHash("sha256").update(String(deviceId)).digest("hex").slice(0, 24);
  return DEVICE_FILE_PREFIX + digest + DEVICE_FILE_SUFFIX;
}

function isDriveDataFileName(name) {
  return (
    name === LEGACY_DRIVE_FILE_NAME ||
    (typeof name === "string" && name.startsWith(DEVICE_FILE_PREFIX) && name.endsWith(DEVICE_FILE_SUFFIX))
  );
}

function databaseSyncContent(database) {
  const normalized = normalizeDatabase(database);
  return {
    cards: normalized.cards,
    deletedCards: normalized.deletedCards
  };
}

function databaseContentEqual(left, right) {
  return stableStringify(databaseSyncContent(left)) === stableStringify(databaseSyncContent(right));
}

// Callers must provide remoteDatabases in a stable order for deterministic conflict winners.
function mergeDatabaseSnapshots(localDatabase, remoteDatabases, lastSyncedAt) {
  let database = normalizeDatabase(localDatabase);
  const conflicts = [];

  for (const remoteDatabase of remoteDatabases) {
    const merged = mergeDatabases(database, normalizeDatabase(remoteDatabase), lastSyncedAt);
    const contentChanged = !databaseContentEqual(database, merged.database);
    database = contentChanged
      ? merged.database
      : normalizeDatabase({ ...merged.database, lastSavedAt: database.lastSavedAt });
    conflicts.push(...merged.conflicts);
  }

  return { database, conflicts };
}

module.exports = {
  DEVICE_FILE_PREFIX,
  LEGACY_DRIVE_FILE_NAME,
  databaseContentEqual,
  deviceSnapshotName,
  escapeDriveQueryLiteral,
  isDriveDataFileName,
  mergeDatabaseSnapshots
};
