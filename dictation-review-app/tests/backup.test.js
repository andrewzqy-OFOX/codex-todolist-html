import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

import { createBackupPayload, importBackupPayload, parseBackupJson, validateBackupPayload } from "../public/js/backup.js";
import { DB_VERSION, STORE_NAMES, addItem, exportStores, getAllItems, resetDatabaseForTests } from "../public/js/db.js";

test.beforeEach(async () => {
  await resetDatabaseForTests();
});

test("backup payload includes schemaVersion and exportedAt", async () => {
  const payload = createBackupPayload(await exportStores(), "2026-07-18T00:00:00.000Z");

  assert.equal(payload.schemaVersion, DB_VERSION);
  assert.equal(payload.exportedAt, "2026-07-18T00:00:00.000Z");
  assert.doesNotThrow(() => validateBackupPayload(payload));
});

test("rejects illegal JSON before import", () => {
  assert.throws(() => parseBackupJson("{bad json"), /合法 JSON/);
});

test("rejects structurally invalid backup without changing existing data", async () => {
  await addItem({
    type: "english_word",
    text: "before",
    createdDate: "2026-07-18",
    nextReviewDate: "2026-07-18"
  });

  await assert.rejects(() => importBackupPayload({ schemaVersion: DB_VERSION, exportedAt: "2026-07-18T00:00:00.000Z", data: {} }), /缺少/);

  const items = await getAllItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "before");
});

test("imports a valid backup atomically", async () => {
  const data = Object.fromEntries(Object.values(STORE_NAMES).map((storeName) => [storeName, []]));
  data.settings.push({
    id: "main",
    schemaVersion: DB_VERSION,
    reviewIntervals: [1, 3, 7, 15, 30, 60],
    characterIntervals: [1, 1, 1],
    lastBackupDate: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  });
  data.items.push({
    id: "item-1",
    type: "chinese_phrase",
    text: "坚持",
    parentId: null,
    reviewUnit: "whole_item",
    status: "active",
    createdDate: "2026-07-18",
    nextReviewDate: "2026-07-18",
    payload: {},
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  });

  await importBackupPayload(createBackupPayload(data, "2026-07-18T00:00:00.000Z"));
  const items = await getAllItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].text, "坚持");
});

