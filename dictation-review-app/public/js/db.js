import { assertLocalDate, toLocalDate } from "./date-utils.js";
import {
  DB_NAME,
  DB_VERSION,
  ITEM_STATUSES,
  STORE_NAMES,
  createLocalId,
  createDefaultSettings,
  normalizeItemInput
} from "./models.js";

let dbPromise = null;
const FALLBACK_STORAGE_KEY = "junior-dictation-review-local-fallback-v1";

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
  });
}

function createStore(db, name, options) {
  return db.objectStoreNames.contains(name) ? null : db.createObjectStore(name, options);
}

function ensureIndex(store, indexName, keyPath, options = {}) {
  if (store && !store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, options);
  }
}

function migrate(event) {
  const db = event.target.result;
  const items = createStore(db, STORE_NAMES.items, { keyPath: "id" });
  ensureIndex(items, "type", "type");
  ensureIndex(items, "status", "status");
  ensureIndex(items, "createdDate", "createdDate");
  ensureIndex(items, "nextReviewDate", "nextReviewDate");
  ensureIndex(items, "parentId", "parentId");

  const reviewEvents = createStore(db, STORE_NAMES.reviewEvents, { keyPath: "id" });
  ensureIndex(reviewEvents, "itemId", "itemId");
  ensureIndex(reviewEvents, "reviewUnit", "reviewUnit");
  ensureIndex(reviewEvents, "date", "date");
  ensureIndex(reviewEvents, "result", "result");
  ensureIndex(reviewEvents, "createdAt", "createdAt");

  const enrichmentCache = createStore(db, STORE_NAMES.enrichmentCache, { keyPath: "id" });
  ensureIndex(enrichmentCache, "queryType", "queryType");
  ensureIndex(enrichmentCache, "normalizedQuery", "normalizedQuery");
  ensureIndex(enrichmentCache, "fetchedAt", "fetchedAt");

  createStore(db, STORE_NAMES.settings, { keyPath: "id" });
}

export function openDatabase(options = {}) {
  const dbName = options.dbName || DB_NAME;
  if (dbPromise && dbName === DB_NAME) {
    return dbPromise;
  }

  const promise = new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = migrate;
    request.onsuccess = async () => {
      const db = request.result;
      try {
        await ensureDefaultSettings(db);
        resolve(db);
      } catch (error) {
        db.close();
        reject(error);
      }
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("Failed to open IndexedDB."));
    };
  });

  if (dbName === DB_NAME) {
    dbPromise = promise;
  }

  return promise;
}

function canUseLocalStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function createFallbackData() {
  const settings = createDefaultSettings();
  return {
    [STORE_NAMES.items]: [],
    [STORE_NAMES.reviewEvents]: [],
    [STORE_NAMES.enrichmentCache]: [],
    [STORE_NAMES.settings]: [settings]
  };
}

function readFallbackData() {
  if (!canUseLocalStorage()) {
    throw new Error("IndexedDB 不可用，且当前浏览器不允许 localStorage 兜底保存。");
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || "null");
    const base = createFallbackData();
    return {
      ...base,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      [STORE_NAMES.items]: Array.isArray(parsed?.[STORE_NAMES.items]) ? parsed[STORE_NAMES.items] : [],
      [STORE_NAMES.reviewEvents]: Array.isArray(parsed?.[STORE_NAMES.reviewEvents]) ? parsed[STORE_NAMES.reviewEvents] : [],
      [STORE_NAMES.enrichmentCache]: Array.isArray(parsed?.[STORE_NAMES.enrichmentCache]) ? parsed[STORE_NAMES.enrichmentCache] : [],
      [STORE_NAMES.settings]: Array.isArray(parsed?.[STORE_NAMES.settings]) && parsed[STORE_NAMES.settings].length
        ? parsed[STORE_NAMES.settings]
        : base[STORE_NAMES.settings]
    };
  } catch (error) {
    throw new Error(`本地兜底数据读取失败：${error.message}`);
  }
}

function writeFallbackData(data) {
  if (!canUseLocalStorage()) {
    throw new Error("当前浏览器不允许 localStorage 兜底保存。");
  }
  localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(data));
}

export function createDbLocalId(prefix = "item", cryptoLike = globalThis.crypto) {
  return createLocalId(prefix, cryptoLike);
}

export async function resetDatabaseForTests(dbName = DB_NAME) {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    if (db) db.close();
    dbPromise = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to delete test database."));
    request.onblocked = () => reject(new Error("Database deletion was blocked."));
  });
}

export async function ensureDefaultSettings(db) {
  const transaction = db.transaction(STORE_NAMES.settings, "readwrite");
  const store = transaction.objectStore(STORE_NAMES.settings);
  const existing = await requestToPromise(store.get("main"));

  if (!existing) {
    store.put(createDefaultSettings());
  }

  await transactionDone(transaction);
}

export async function getSettings() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.settings, "readonly");
    return requestToPromise(transaction.objectStore(STORE_NAMES.settings).get("main"));
  } catch {
    const data = readFallbackData();
    return data[STORE_NAMES.settings].find((item) => item.id === "main") || createDefaultSettings();
  }
}

export async function updateSettings(patch) {
  const next = {
    ...(await getSettings()),
    ...patch,
    id: "main",
    schemaVersion: DB_VERSION,
    updatedAt: new Date().toISOString()
  };

  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.settings, "readwrite");
    transaction.objectStore(STORE_NAMES.settings).put(next);
    await transactionDone(transaction);
  } catch {
    const data = readFallbackData();
    data[STORE_NAMES.settings] = [next];
    writeFallbackData(data);
  }

  return next;
}

export async function addItem(input) {
  const today = toLocalDate();
  const item = normalizeItemInput({
    ...input,
    createdDate: input.createdDate || today
  });

  assertLocalDate(item.createdDate, "createdDate");
  assertLocalDate(item.nextReviewDate, "nextReviewDate");

  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.items, "readwrite");
    transaction.objectStore(STORE_NAMES.items).add(item);
    await transactionDone(transaction);
  } catch {
    const data = readFallbackData();
    data[STORE_NAMES.items].push(item);
    writeFallbackData(data);
  }

  return item;
}

export async function getItem(id) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.items, "readonly");
    return requestToPromise(transaction.objectStore(STORE_NAMES.items).get(id));
  } catch {
    return readFallbackData()[STORE_NAMES.items].find((item) => item.id === id);
  }
}

export async function getAllItems(includeArchived = false) {
  let items;
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.items, "readonly");
    items = await requestToPromise(transaction.objectStore(STORE_NAMES.items).getAll());
  } catch {
    items = readFallbackData()[STORE_NAMES.items];
  }
  return includeArchived ? items : items.filter((item) => item.status !== ITEM_STATUSES.archived);
}

export async function updateItem(id, patch) {
  const existing = await getItem(id);
  if (!existing) {
    throw new Error(`Item ${id} was not found.`);
  }

  const updated = {
    ...existing,
    ...patch,
    id,
    updatedAt: new Date().toISOString()
  };

  if (updated.createdDate) assertLocalDate(updated.createdDate, "createdDate");
  if (updated.nextReviewDate) assertLocalDate(updated.nextReviewDate, "nextReviewDate");

  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.items, "readwrite");
    transaction.objectStore(STORE_NAMES.items).put(updated);
    await transactionDone(transaction);
  } catch {
    const data = readFallbackData();
    const index = data[STORE_NAMES.items].findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Item ${id} was not found.`);
    data[STORE_NAMES.items][index] = updated;
    writeFallbackData(data);
  }

  return updated;
}

export function archiveItem(id) {
  return updateItem(id, { status: ITEM_STATUSES.archived });
}

export async function getItemsByType(type) {
  let items;
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.items, "readonly");
    items = await requestToPromise(transaction.objectStore(STORE_NAMES.items).index("type").getAll(type));
  } catch {
    items = readFallbackData()[STORE_NAMES.items].filter((item) => item.type === type);
  }
  return items.filter((item) => item.status !== ITEM_STATUSES.archived);
}

export async function getDueItems(today = toLocalDate()) {
  assertLocalDate(today, "today");
  let items;
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.items, "readonly");
    const range = IDBKeyRange.upperBound(today);
    items = await requestToPromise(transaction.objectStore(STORE_NAMES.items).index("nextReviewDate").getAll(range));
  } catch {
    items = readFallbackData()[STORE_NAMES.items].filter((item) => item.nextReviewDate <= today);
  }
  return items.filter((item) => item.status !== ITEM_STATUSES.archived);
}

export async function addReviewEvent(input) {
  const now = new Date();
  const event = {
    ...input,
    id: input.id || crypto.randomUUID(),
    itemId: input.itemId,
    reviewUnit: input.reviewUnit,
    date: input.date || toLocalDate(now),
    result: input.result,
    wrongCharacters: input.wrongCharacters || [],
    isSameDayRetry: Boolean(input.isSameDayRetry),
    createdAt: input.createdAt || now.toISOString()
  };

  assertLocalDate(event.date, "date");

  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.reviewEvents, "readwrite");
    transaction.objectStore(STORE_NAMES.reviewEvents).add(event);
    await transactionDone(transaction);
  } catch {
    const data = readFallbackData();
    data[STORE_NAMES.reviewEvents].push(event);
    writeFallbackData(data);
  }

  return event;
}

export async function getEnrichmentCacheByQuery(queryType, normalizedQuery) {
  let items;
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.enrichmentCache, "readonly");
    items = await requestToPromise(
      transaction.objectStore(STORE_NAMES.enrichmentCache).index("normalizedQuery").getAll(normalizedQuery)
    );
  } catch {
    items = readFallbackData()[STORE_NAMES.enrichmentCache].filter((item) => item.normalizedQuery === normalizedQuery);
  }
  return items.find((item) => item.queryType === queryType) || null;
}

export async function saveEnrichmentCache(input) {
  const now = new Date();
  const existing = await getEnrichmentCacheByQuery(input.queryType, input.normalizedQuery);
  const cacheEntry = {
    id: input.id || existing?.id || crypto.randomUUID(),
    queryType: input.queryType,
    normalizedQuery: input.normalizedQuery,
    result: input.result,
    status: input.status || "pending_parent_confirmation",
    fetchedAt: input.fetchedAt || existing?.fetchedAt || now.toISOString(),
    updatedAt: now.toISOString()
  };

  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.enrichmentCache, "readwrite");
    transaction.objectStore(STORE_NAMES.enrichmentCache).put(cacheEntry);
    await transactionDone(transaction);
  } catch {
    const data = readFallbackData();
    const index = data[STORE_NAMES.enrichmentCache].findIndex((item) => item.id === cacheEntry.id);
    if (index >= 0) data[STORE_NAMES.enrichmentCache][index] = cacheEntry;
    else data[STORE_NAMES.enrichmentCache].push(cacheEntry);
    writeFallbackData(data);
  }

  return cacheEntry;
}

export async function addItems(items) {
  const normalizedItems = items.map((input) => {
    const today = toLocalDate();
    const item = normalizeItemInput({
      ...input,
      createdDate: input.createdDate || today
    });
    assertLocalDate(item.createdDate, "createdDate");
    assertLocalDate(item.nextReviewDate, "nextReviewDate");
    return item;
  });

  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAMES.items, "readwrite");
    const store = transaction.objectStore(STORE_NAMES.items);
    for (const item of normalizedItems) {
      store.add(item);
    }
    await transactionDone(transaction);
  } catch {
    const data = readFallbackData();
    data[STORE_NAMES.items].push(...normalizedItems);
    writeFallbackData(data);
  }

  return normalizedItems;
}

export async function getAllFromStore(storeName) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readonly");
    return requestToPromise(transaction.objectStore(storeName).getAll());
  } catch {
    return readFallbackData()[storeName] || [];
  }
}

export async function exportStores() {
  const data = {};
  for (const storeName of Object.values(STORE_NAMES)) {
    data[storeName] = await getAllFromStore(storeName);
  }
  return data;
}

export async function replaceStores(data) {
  const storeNames = Object.values(STORE_NAMES);

  try {
    const db = await openDatabase();
    const transaction = db.transaction(storeNames, "readwrite");

    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const record of data[storeName]) {
        store.add(record);
      }
    }

    await transactionDone(transaction);
  } catch {
    writeFallbackData({
      ...createFallbackData(),
      ...data
    });
  }
}

export { DB_NAME, DB_VERSION, STORE_NAMES };
