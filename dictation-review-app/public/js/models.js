export const DB_NAME = "junior-dictation-review";
export const DB_VERSION = 1;

export const STORE_NAMES = Object.freeze({
  items: "items",
  reviewEvents: "reviewEvents",
  enrichmentCache: "enrichmentCache",
  settings: "settings"
});

export const ITEM_TYPES = Object.freeze({
  englishWord: "english_word",
  chinesePhrase: "chinese_phrase",
  poem: "poem",
  poemLine: "poem_line"
});

export const ITEM_STATUSES = Object.freeze({
  active: "active",
  archived: "archived"
});

export const DEFAULT_REVIEW_INTERVALS = Object.freeze([1, 3, 7, 15, 30, 60]);
export const DEFAULT_CHARACTER_INTERVALS = Object.freeze([3, 7, 7]);

export function createLocalId(prefix = "item", cryptoLike = globalThis.crypto) {
  if (typeof cryptoLike?.randomUUID === "function") {
    return cryptoLike.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDefaultSettings(now = new Date()) {
  return {
    id: "main",
    schemaVersion: DB_VERSION,
    reviewIntervals: [...DEFAULT_REVIEW_INTERVALS],
    characterIntervals: [...DEFAULT_CHARACTER_INTERVALS],
    lastBackupDate: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

export function normalizeItemInput(input, now = new Date()) {
  const createdDate = input.createdDate;
  const nextReviewDate = input.nextReviewDate || createdDate;

  return {
    ...input,
    id: input.id || createLocalId("item"),
    type: input.type,
    text: input.text,
    parentId: input.parentId || null,
    reviewUnit: input.reviewUnit || "whole_item",
    status: input.status || ITEM_STATUSES.active,
    createdDate,
    nextReviewDate,
    payload: input.payload || {},
    createdAt: input.createdAt || now.toISOString(),
    updatedAt: now.toISOString()
  };
}
