const assert = require("node:assert/strict");
const test = require("node:test");
const { commitSyncPlan, recoverPendingSync } = require("./sync-transaction.cjs");

function fields(summary) {
  return {
    concept: "concept",
    encounteredBecause: "",
    solves: "",
    doesNotSolve: "",
    verification: "",
    summary,
    notes: ""
  };
}

function database(summary, lastSavedAt = "2026-01-02T00:00:00.000Z") {
  return {
    schemaVersion: 2,
    deviceId: "device-a",
    cards: [
      {
        id: "card-1",
        category: "AI/LLM / 基础概念",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: lastSavedAt,
        updateHistory: [lastSavedAt],
        fields: fields(summary)
      }
    ],
    deletedCards: {},
    lastSavedAt
  };
}

test("remote commit is journaled when local save fails", async () => {
  let transaction = null;
  let stateSaved = false;
  let cleared = false;
  const local = database("old");
  const next = database("merged", "2026-01-03T00:00:00.000Z");

  await assert.rejects(
    commitSyncPlan(
      {
        localDatabase: local,
        nextDatabase: next,
        contentChanged: true,
        shouldUpload: true,
        ownFile: { id: "file-1", version: "1" },
        ownFileName: "device.json",
        syncStartedAt: "2026-01-03T00:00:00.000Z",
        previousSyncState: {}
      },
      {
        saveTransaction: async (value) => {
          transaction = value;
        },
        upload: async () => ({ id: "file-1", version: "2" }),
        saveLocal: async () => {
          throw new Error("disk full");
        },
        saveState: async () => {
          stateSaved = true;
        },
        clearTransaction: async () => {
          cleared = true;
        }
      }
    ),
    /disk full/
  );

  assert.equal(transaction.phase, "remote-committed");
  assert.equal(transaction.remoteMetadata.version, "2");
  assert.equal(stateSaved, false);
  assert.equal(cleared, false);
});

test("a committed remote transaction restores local data and sync state", async () => {
  let local = database("old");
  let state = null;
  let cleared = false;
  const intended = database("merged", "2026-01-03T00:00:00.000Z");
  const transaction = {
    version: 1,
    phase: "remote-committed",
    syncStartedAt: "2026-01-03T00:00:00.000Z",
    previousSyncState: {},
    previousLocalSavedAt: local.lastSavedAt,
    nextDatabase: intended,
    ownFileName: "device.json",
    remoteMetadata: { id: "file-1", version: "2" }
  };

  const result = await recoverPendingSync({
    readTransaction: async () => transaction,
    loadLocal: async () => local,
    saveLocal: async (value) => {
      local = value;
      return value;
    },
    saveState: async (value) => {
      state = value;
    },
    clearTransaction: async () => {
      cleared = true;
    },
    nowIso: () => "2026-01-04T00:00:00.000Z"
  });

  assert.equal(result.recovered, true);
  assert.equal(local.cards.some((card) => card.id === "card-1" && card.fields.summary === "merged"), true);
  assert.equal(local.cards.some((card) => card.conflictOf === "card-1" && card.fields.summary === "old"), true);
  assert.equal(state.remoteFileId, "file-1");
  assert.equal(state.remoteVersion, "2");
  assert.equal(cleared, true);
});

test("an uncommitted prepared transaction is discarded for a normal remote rescan", async () => {
  let cleared = false;
  const result = await recoverPendingSync({
    readTransaction: async () => ({
      version: 1,
      phase: "prepared",
      syncStartedAt: "2026-01-03T00:00:00.000Z",
      previousSyncState: {},
      nextDatabase: database("planned"),
      ownFileName: "device.json"
    }),
    clearTransaction: async () => {
      cleared = true;
    }
  });

  assert.equal(result.recovered, false);
  assert.equal(cleared, true);
});

test("an invalid transaction record is cleared safely", async () => {
  let cleared = false;
  const result = await recoverPendingSync({
    readTransaction: async () => ({ version: 999, phase: "unknown" }),
    clearTransaction: async () => {
      cleared = true;
    }
  });

  assert.equal(result.recovered, false);
  assert.equal(cleared, true);
});
