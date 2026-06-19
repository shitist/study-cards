const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mergeDatabases,
  normalizeCard,
  normalizeDatabase,
  stableStringify,
  validateCardDatabaseForSave
} = require("./card-data.cjs");

const CREATED_AT = "2026-01-01T00:00:00.000Z";

function makeFields(overrides = {}) {
  return {
    concept: "GGUF",
    encounteredBecause: "local inference notes",
    solves: "model packaging",
    doesNotSolve: "model architecture",
    verification: "compare loaders",
    summary: "a quantized model file format",
    ...overrides
  };
}

function makeCard(overrides = {}) {
  const updatedAt = overrides.updatedAt || "2026-01-02T00:00:00.000Z";
  return {
    id: "card-1",
    category: "AI/LLM / \u63a8\u7406\u90e8\u7f72\u4e0e\u91cf\u5316",
    createdAt: CREATED_AT,
    updatedAt,
    updateHistory: [CREATED_AT, updatedAt],
    fields: makeFields(),
    ...overrides
  };
}

function makeDatabase(cards, overrides = {}) {
  return {
    schemaVersion: 1,
    deviceId: "device-1",
    cards,
    lastSavedAt: "2026-01-04T00:00:00.000Z",
    ...overrides
  };
}

test("normalizeDatabase fills a tolerant canonical database shape", () => {
  const normalized = normalizeDatabase({
    deviceId: "device-1",
    cards: [
      {
        id: "card-1",
        updatedAt: "2026-01-02T00:00:00.000Z",
        updateHistory: ["2026-01-02T00:00:00.000Z", 42],
        fields: { concept: "RAG", summary: 100 }
      },
      null
    ]
  });

  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.deviceId, "device-1");
  assert.equal(normalized.cards.length, 1);
  assert.equal(normalized.cards[0].category, "\u672a\u5206\u7c7b");
  assert.deepEqual(normalized.cards[0].updateHistory, ["2026-01-02T00:00:00.000Z"]);
  assert.equal(normalized.cards[0].fields.concept, "RAG");
  assert.equal(normalized.cards[0].fields.summary, "");
});

test("validateCardDatabaseForSave rejects unknown database, card, and field keys", () => {
  const valid = makeDatabase([makeCard()]);
  assert.doesNotThrow(() => validateCardDatabaseForSave(valid));

  assert.throws(
    () => validateCardDatabaseForSave({ ...valid, injected: true }),
    /database has unknown field "injected"/
  );

  assert.throws(
    () => validateCardDatabaseForSave(makeDatabase([{ ...makeCard(), injected: true }])),
    /database\.cards\[0\] has unknown field "injected"/
  );

  assert.throws(
    () => validateCardDatabaseForSave(makeDatabase([{ ...makeCard(), fields: { ...makeFields(), injected: "x" } }])),
    /database\.cards\[0\]\.fields has unknown field "injected"/
  );
});

test("validateCardDatabaseForSave rejects wrong required types", () => {
  assert.throws(
    () => validateCardDatabaseForSave(makeDatabase([{ ...makeCard(), updateHistory: [CREATED_AT, 123] }])),
    /updateHistory must be an array of strings/
  );

  assert.throws(
    () => validateCardDatabaseForSave(makeDatabase([{ ...makeCard(), fields: { ...makeFields(), concept: null } }])),
    /fields\.concept must be a string/
  );
});

test("stableStringify ignores object property order", () => {
  const left = { b: 1, a: { d: 4, c: [{ z: 3, y: 2 }] } };
  const right = { a: { c: [{ y: 2, z: 3 }], d: 4 }, b: 1 };

  assert.equal(stableStringify(left), stableStringify(right));
});

test("stableStringify follows JSON semantics for undefined values", () => {
  assert.equal(stableStringify({ b: undefined, a: 1 }), '{"a":1}');
  assert.equal(stableStringify({ a: { c: 2, b: undefined } }), '{"a":{"c":2}}');
  assert.equal(stableStringify([undefined, 1]), "[null,1]");
});

test("normalizeCard omits conflictOf when it is absent", () => {
  const normalized = normalizeCard(makeCard({ conflictOf: undefined }));
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "conflictOf"), false);
});

test("mergeDatabases keeps the local loser as a conflict copy when remote wins", () => {
  const local = makeCard({
    id: "same-card",
    updatedAt: "2026-01-03T00:00:00.000Z",
    fields: makeFields({ concept: "local edit" })
  });
  const remote = makeCard({
    id: "same-card",
    updatedAt: "2026-01-04T00:00:00.000Z",
    fields: makeFields({ concept: "remote edit" })
  });

  const result = mergeDatabases(
    makeDatabase([local]),
    makeDatabase([remote], { deviceId: "device-2" }),
    "2026-01-02T00:00:00.000Z"
  );

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.database.cards.length, 2);
  const conflictCopy = result.database.cards.find((card) => card.conflictOf === "same-card");
  assert.ok(result.database.cards.some((card) => card.id === "same-card" && card.fields.concept === "remote edit"));
  assert.equal(conflictCopy.fields.concept, "local edit（冲突副本）");
});

test("mergeDatabases keeps the remote loser as a conflict copy when local wins", () => {
  const local = makeCard({
    id: "same-card",
    updatedAt: "2026-01-05T00:00:00.000Z",
    fields: makeFields({ concept: "local edit" })
  });
  const remote = makeCard({
    id: "same-card",
    updatedAt: "2026-01-04T00:00:00.000Z",
    fields: makeFields({ concept: "remote edit" })
  });

  const result = mergeDatabases(
    makeDatabase([local]),
    makeDatabase([remote], { deviceId: "device-2" }),
    "2026-01-02T00:00:00.000Z"
  );

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.database.cards.length, 2);
  const conflictCopy = result.database.cards.find((card) => card.conflictOf === "same-card");
  assert.ok(result.database.cards.some((card) => card.id === "same-card" && card.fields.concept === "local edit"));
  assert.equal(conflictCopy.fields.concept, "remote edit（冲突副本）");
});

test("mergeDatabases treats lastSyncedAt null as a conflict and preserves the loser", () => {
  const local = makeCard({
    id: "same-card",
    updatedAt: "2026-01-03T00:00:00.000Z",
    fields: makeFields({ concept: "local edit" })
  });
  const remote = makeCard({
    id: "same-card",
    updatedAt: "2026-01-04T00:00:00.000Z",
    fields: makeFields({ concept: "remote edit" })
  });

  const result = mergeDatabases(
    makeDatabase([local]),
    makeDatabase([remote], { deviceId: "device-2" }),
    null
  );

  const conflictCopy = result.database.cards.find((card) => card.conflictOf === "same-card");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.database.cards.length, 2);
  assert.ok(result.database.cards.some((card) => card.id === "same-card" && card.fields.concept === "remote edit"));
  assert.equal(conflictCopy.fields.concept, "local edit（冲突副本）");
});

test("mergeDatabases takes the remote card without conflict when only remote changed", () => {
  const local = makeCard({
    id: "same-card",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fields: makeFields({ concept: "old local" })
  });
  const remote = makeCard({
    id: "same-card",
    updatedAt: "2026-01-04T00:00:00.000Z",
    fields: makeFields({ concept: "new remote" })
  });

  const result = mergeDatabases(
    makeDatabase([local]),
    makeDatabase([remote], { deviceId: "device-2" }),
    "2026-01-02T00:00:00.000Z"
  );

  assert.equal(result.conflicts.length, 0);
  assert.equal(result.database.cards.length, 1);
  assert.equal(result.database.cards[0].fields.concept, "new remote");
});
