const assert = require("node:assert/strict");
const test = require("node:test");
const {
  databaseContentEqual,
  deviceSnapshotName,
  escapeDriveQueryLiteral,
  isDriveDataFileName,
  mergeDatabaseSnapshots
} = require("./drive-sync-data.cjs");

function card(id, summary, updatedAt) {
  return {
    id,
    category: "AI/LLM > 基础概念",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    updateHistory: [updatedAt],
    fields: {
      concept: id,
      encounteredBecause: "",
      solves: "",
      doesNotSolve: "",
      verification: "",
      notes: "",
      summary
    }
  };
}

function database(deviceId, cards, deletedCards = {}) {
  return {
    schemaVersion: 2,
    deviceId,
    cards,
    deletedCards,
    lastSavedAt: "2026-01-03T00:00:00.000Z"
  };
}

test("device snapshot names are stable and isolated per device", () => {
  const first = deviceSnapshotName("device-a");
  assert.equal(first, deviceSnapshotName("device-a"));
  assert.notEqual(first, deviceSnapshotName("device-b"));
  assert.equal(isDriveDataFileName(first), true);
  assert.equal(isDriveDataFileName("study-cards-data.json"), true);
  assert.equal(isDriveDataFileName("unrelated.json"), false);
});

test("merging concurrent device snapshots preserves the losing edit as a conflict", () => {
  const local = database("device-a", [card("shared", "local edit", "2026-01-03T00:00:00.000Z")]);
  const remote = database("device-b", [card("shared", "remote edit", "2026-01-04T00:00:00.000Z")]);
  const result = mergeDatabaseSnapshots(local, [remote], "2026-01-02T00:00:00.000Z");

  assert.equal(result.database.cards.some((item) => item.fields.summary === "remote edit"), true);
  assert.equal(result.database.cards.some((item) => item.fields.summary === "local edit" && item.conflictOf === "shared"), true);
  assert.equal(result.conflicts.length, 1);
});

test("a newer deletion wins over a stale snapshot on another device", () => {
  const local = database("device-a", [], {
    shared: { deletedAt: "2026-01-05T00:00:00.000Z", deviceId: "device-a" }
  });
  const staleRemote = database("device-b", [card("shared", "stale", "2026-01-01T00:00:00.000Z")]);
  const result = mergeDatabaseSnapshots(local, [staleRemote], "2026-01-04T00:00:00.000Z");

  assert.equal(result.database.cards.some((item) => item.id === "shared"), false);
  assert.equal(Boolean(result.database.deletedCards.shared), true);
});

test("equal snapshot content does not count metadata-only differences", () => {
  const left = database("device-a", [card("same", "same", "2026-01-01T00:00:00.000Z")]);
  const right = { ...database("device-b", left.cards), lastSavedAt: "2026-02-01T00:00:00.000Z" };
  assert.equal(databaseContentEqual(left, right), true);
});

test("escapeDriveQueryLiteral escapes backslashes and apostrophes", () => {
  const backslash = String.fromCharCode(92);
  assert.equal(
    escapeDriveQueryLiteral("device" + backslash + "name's"),
    "device" + backslash + backslash + "name" + backslash + "'s"
  );
});
