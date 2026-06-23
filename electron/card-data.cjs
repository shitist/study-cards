const crypto = require("node:crypto");

const DATABASE_KEYS = new Set(["schemaVersion", "deviceId", "cards", "deletedCards", "lastSavedAt"]);
const CARD_KEYS = new Set(["id", "category", "createdAt", "updatedAt", "updateHistory", "conflictOf", "fields"]);
const FIELD_KEYS = new Set(["concept", "encounteredBecause", "solves", "doesNotSolve", "verification", "summary", "notes"]);
const DELETION_KEYS = new Set(["deletedAt", "deviceId"]);
const FALLBACK_CATEGORY = "\u672a\u5206\u7c7b";
const CONFLICT_SUFFIX = "\uff08\u51b2\u7a81\u526f\u672c\uff09";

function nowIso() {
  return new Date().toISOString();
}

function createEmptyDatabase() {
  return {
    schemaVersion: 2,
    deviceId: crypto.randomUUID(),
    cards: [],
    deletedCards: {},
    lastSavedAt: nowIso()
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertPlainObject(value, path) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
}

function assertKnownKeys(value, allowedKeys, path) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`${path} has unknown field "${key}".`);
    }
  }
}

function assertRequiredString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string.`);
  }
}

function validateCardFieldsForSave(fields, path) {
  assertPlainObject(fields, path);
  assertKnownKeys(fields, FIELD_KEYS, path);

  for (const key of FIELD_KEYS) {
    if (typeof fields[key] !== "string") {
      throw new TypeError(`${path}.${key} must be a string.`);
    }
  }
}

function validateCardForSave(card, path) {
  assertPlainObject(card, path);
  assertKnownKeys(card, CARD_KEYS, path);

  assertRequiredString(card.id, `${path}.id`);
  assertRequiredString(card.category, `${path}.category`);
  assertRequiredString(card.createdAt, `${path}.createdAt`);
  assertRequiredString(card.updatedAt, `${path}.updatedAt`);

  if (!Array.isArray(card.updateHistory) || card.updateHistory.some((item) => typeof item !== "string")) {
    throw new TypeError(`${path}.updateHistory must be an array of strings.`);
  }

  if (Object.prototype.hasOwnProperty.call(card, "conflictOf") && card.conflictOf !== undefined && typeof card.conflictOf !== "string") {
    throw new TypeError(`${path}.conflictOf must be a string when present.`);
  }

  validateCardFieldsForSave(card.fields, `${path}.fields`);
}

function validateDeletionForSave(deletion, path) {
  assertPlainObject(deletion, path);
  assertKnownKeys(deletion, DELETION_KEYS, path);
  assertRequiredString(deletion.deletedAt, `${path}.deletedAt`);
  assertRequiredString(deletion.deviceId, `${path}.deviceId`);
}

function validateCardDatabaseForSave(database) {
  assertPlainObject(database, "database");
  assertKnownKeys(database, DATABASE_KEYS, "database");

  if (database.schemaVersion !== 2) {
    throw new TypeError("database.schemaVersion must be 2.");
  }
  assertRequiredString(database.deviceId, "database.deviceId");
  assertRequiredString(database.lastSavedAt, "database.lastSavedAt");

  if (!Array.isArray(database.cards)) {
    throw new TypeError("database.cards must be an array.");
  }
  database.cards.forEach((card, index) => validateCardForSave(card, `database.cards[${index}]`));

  assertPlainObject(database.deletedCards, "database.deletedCards");
  for (const [cardId, deletion] of Object.entries(database.deletedCards)) {
    assertRequiredString(cardId, "database.deletedCards key");
    validateDeletionForSave(deletion, `database.deletedCards[${JSON.stringify(cardId)}]`);
  }

  return normalizeDatabase(database);
}

function normalizeDeletedCards(value, fallbackDeviceId) {
  if (!isPlainObject(value)) return {};

  const deletedCards = {};
  for (const [cardId, deletion] of Object.entries(value)) {
    if (!cardId || !isPlainObject(deletion) || typeof deletion.deletedAt !== "string" || !deletion.deletedAt) continue;
    deletedCards[cardId] = {
      deletedAt: deletion.deletedAt,
      deviceId: typeof deletion.deviceId === "string" && deletion.deviceId ? deletion.deviceId : fallbackDeviceId
    };
  }
  return deletedCards;
}

function normalizeDatabase(value) {
  const fallback = createEmptyDatabase();
  if (!value || typeof value !== "object") return fallback;

  const deviceId = typeof value.deviceId === "string" && value.deviceId ? value.deviceId : fallback.deviceId;
  const cards = Array.isArray(value.cards) ? value.cards.map(normalizeCard).filter(Boolean) : [];
  const deletedCards = normalizeDeletedCards(value.deletedCards, deviceId);
  const activeCards = [];

  // cards and deletedCards are separate collections, so removing an obsolete tombstone is iteration-safe.
  for (const card of cards) {
    const deletion = deletedCards[card.id];
    if (!deletion || card.updatedAt > deletion.deletedAt) {
      activeCards.push(card);
      if (deletion) delete deletedCards[card.id];
    }
  }

  return {
    schemaVersion: 2,
    deviceId,
    cards: activeCards,
    deletedCards,
    lastSavedAt: typeof value.lastSavedAt === "string" ? value.lastSavedAt : nowIso()
  };
}

function normalizeCard(card) {
  if (!card || typeof card !== "object") return null;
  const createdAt = typeof card.createdAt === "string" ? card.createdAt : nowIso();
  const updatedAt = typeof card.updatedAt === "string" ? card.updatedAt : createdAt;
  const fields = card.fields && typeof card.fields === "object" ? card.fields : {};

  return {
    id: typeof card.id === "string" && card.id ? card.id : crypto.randomUUID(),
    category: typeof card.category === "string" ? card.category : FALLBACK_CATEGORY,
    createdAt,
    updatedAt,
    updateHistory: Array.isArray(card.updateHistory) ? card.updateHistory.filter((item) => typeof item === "string") : [updatedAt],
    ...(typeof card.conflictOf === "string" ? { conflictOf: card.conflictOf } : {}),
    fields: {
      concept: typeof fields.concept === "string" ? fields.concept : "",
      encounteredBecause: typeof fields.encounteredBecause === "string" ? fields.encounteredBecause : "",
      solves: typeof fields.solves === "string" ? fields.solves : "",
      doesNotSolve: typeof fields.doesNotSolve === "string" ? fields.doesNotSolve : "",
      verification: typeof fields.verification === "string" ? fields.verification : "",
      summary: typeof fields.summary === "string" ? fields.summary : "",
      notes: typeof fields.notes === "string" ? fields.notes : ""
    }
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => {
      const encoded = stableStringify(item);
      return encoded === undefined ? "null" : encoded;
    }).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const encoded = stableStringify(value[key]);
        return encoded === undefined ? null : `${JSON.stringify(key)}:${encoded}`;
      })
      .filter(Boolean);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function cardsEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function cloneCardAsConflict(card, timestamp) {
  const copy = normalizeCard(card);
  copy.id = crypto.randomUUID();
  copy.conflictOf = card.id;
  copy.updatedAt = timestamp;
  copy.updateHistory = [...new Set([...(copy.updateHistory || []), timestamp])];
  copy.fields = {
    ...copy.fields,
    concept: `${copy.fields.concept || "\u672a\u547d\u540d\u5361\u7247"}${CONFLICT_SUFFIX}`
  };
  return copy;
}

function mergeDatabases(localDb, remoteDb, lastSyncedAt) {
  const timestamp = nowIso();
  const localDatabase = normalizeDatabase(localDb);
  const remoteDatabase = normalizeDatabase(remoteDb);
  const mergedCards = new Map();
  const mergedDeletions = {};
  const conflicts = [];
  const localById = new Map(localDatabase.cards.map((card) => [card.id, card]));
  const remoteById = new Map(remoteDatabase.cards.map((card) => [card.id, card]));
  const ids = new Set([
    ...localById.keys(),
    ...remoteById.keys(),
    ...Object.keys(localDatabase.deletedCards),
    ...Object.keys(remoteDatabase.deletedCards)
  ]);

  function keepCard(card) {
    mergedCards.set(card.id, card);
  }

  function keepDeletion(id, deletion) {
    mergedDeletions[id] = deletion;
  }

  for (const id of ids) {
    const local = localById.get(id);
    const remote = remoteById.get(id);
    const localDeletion = localDatabase.deletedCards[id];
    const remoteDeletion = remoteDatabase.deletedCards[id];

    if (localDeletion || remoteDeletion) {
      const deletion = !localDeletion
        ? remoteDeletion
        : !remoteDeletion
          ? localDeletion
          : localDeletion.deletedAt >= remoteDeletion.deletedAt
            ? localDeletion
            : remoteDeletion;
      const card = local || remote;

      if (!card) {
        keepDeletion(id, deletion);
        continue;
      }

      const cardChangedAfterSync = lastSyncedAt ? card.updatedAt > lastSyncedAt : true;
      const deletionChangedAfterSync = lastSyncedAt ? deletion.deletedAt > lastSyncedAt : true;

      if (cardChangedAfterSync && deletionChangedAfterSync) {
        const conflictCopy = cloneCardAsConflict(card, timestamp);
        conflicts.push(conflictCopy);
        keepCard(conflictCopy);
        keepDeletion(id, deletion);
        continue;
      }

      if (deletionChangedAfterSync && !cardChangedAfterSync) {
        keepDeletion(id, deletion);
      } else if (cardChangedAfterSync && !deletionChangedAfterSync) {
        keepCard(card);
      } else if (deletion.deletedAt >= card.updatedAt) {
        keepDeletion(id, deletion);
      } else {
        keepCard(card);
      }
      continue;
    }

    if (!local && remote) {
      keepCard(remote);
      continue;
    }
    if (local && !remote) {
      keepCard(local);
      continue;
    }
    if (!local || !remote) continue;
    if (cardsEqual(local, remote)) {
      keepCard(local);
      continue;
    }

    const localChangedAfterSync = lastSyncedAt ? local.updatedAt > lastSyncedAt : true;
    const remoteChangedAfterSync = lastSyncedAt ? remote.updatedAt > lastSyncedAt : true;

    if (localChangedAfterSync && remoteChangedAfterSync) {
      const localWins = local.updatedAt >= remote.updatedAt;
      const winner = localWins ? local : remote;
      const loser = localWins ? remote : local;
      const conflictCopy = cloneCardAsConflict(loser, timestamp);
      conflicts.push(conflictCopy);
      keepCard(winner);
      keepCard(conflictCopy);
      continue;
    }

    keepCard(local.updatedAt >= remote.updatedAt ? local : remote);
  }

  return {
    database: normalizeDatabase({
      ...localDatabase,
      cards: Array.from(mergedCards.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      deletedCards: mergedDeletions,
      lastSavedAt: timestamp
    }),
    conflicts
  };
}

module.exports = {
  cardsEqual,
  createEmptyDatabase,
  mergeDatabases,
  normalizeCard,
  normalizeDatabase,
  nowIso,
  stableStringify,
  validateCardDatabaseForSave
};
