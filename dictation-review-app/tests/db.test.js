import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

import {
  DB_VERSION,
  STORE_NAMES,
  addItem,
  exportStores,
  getAllItems,
  getDueItems,
  getItem,
  getItemsByType,
  getSettings,
  openDatabase,
  resetDatabaseForTests
} from "../public/js/db.js";

test.beforeEach(async () => {
  await resetDatabaseForTests();
});

test("initializes IndexedDB stores and settings", async () => {
  const db = await openDatabase();
  const names = Array.from(db.objectStoreNames).sort();

  assert.deepEqual(names, Object.values(STORE_NAMES).sort());

  const settings = await getSettings();
  assert.equal(settings.schemaVersion, DB_VERSION);
  assert.ok(Array.isArray(settings.reviewIntervals));
  assert.ok(Array.isArray(settings.characterIntervals));
});

test("adds and reads an item", async () => {
  const item = await addItem({
    type: "english_word",
    text: "example",
    createdDate: "2026-07-18",
    nextReviewDate: "2026-07-18"
  });

  const saved = await getItem(item.id);
  assert.equal(saved.text, "example");
  assert.equal(saved.status, "active");
});

test("queries by type and due date indexes", async () => {
  await addItem({
    type: "english_word",
    text: "example",
    createdDate: "2026-07-18",
    nextReviewDate: "2026-07-19"
  });
  await addItem({
    type: "chinese_phrase",
    text: "坚持",
    createdDate: "2026-07-18",
    nextReviewDate: "2026-07-20"
  });

  const english = await getItemsByType("english_word");
  assert.equal(english.length, 1);
  assert.equal(english[0].text, "example");

  const due = await getDueItems("2026-07-19");
  assert.equal(due.length, 1);
  assert.equal(due[0].text, "example");
});

test("exports JSON-ready store data", async () => {
  await addItem({
    type: "poem",
    text: "静夜思",
    createdDate: "2026-07-18",
    nextReviewDate: "2026-07-18"
  });

  const data = await exportStores();
  assert.equal(data.items.length, 1);
  assert.equal(data.settings.length, 1);
  assert.doesNotThrow(() => JSON.stringify(data));

  const allItems = await getAllItems();
  assert.equal(allItems.length, 1);
});

test("falls back to localStorage when IndexedDB is unavailable", async () => {
  const originalIndexedDB = globalThis.indexedDB;
  const originalLocalStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.indexedDB = undefined;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  };

  try {
    const item = await addItem({
      type: "english_word",
      text: "fallback",
      createdDate: "2026-07-18",
      nextReviewDate: "2026-07-18"
    });
    const items = await getAllItems(true);
    const settings = await getSettings();

    assert.equal(item.text, "fallback");
    assert.equal(items.length, 1);
    assert.equal(items[0].text, "fallback");
    assert.equal(settings.schemaVersion, DB_VERSION);
  } finally {
    globalThis.indexedDB = originalIndexedDB;
    globalThis.localStorage = originalLocalStorage;
  }
});
