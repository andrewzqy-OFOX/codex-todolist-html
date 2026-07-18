import { DB_VERSION, STORE_NAMES, exportStores, replaceStores, updateSettings } from "./db.js";

const REQUIRED_STORES = Object.values(STORE_NAMES);

export function createBackupPayload(data, exportedAt = new Date().toISOString()) {
  return {
    schemaVersion: DB_VERSION,
    exportedAt,
    data
  };
}

export async function exportBackupPayload() {
  const data = await exportStores();
  return createBackupPayload(data);
}

export async function exportBackupFile() {
  const payload = await exportBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dictation-review-backup-${payload.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  await updateSettings({ lastBackupDate: payload.exportedAt.slice(0, 10) });
  return payload;
}

export function parseBackupJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("备份文件不是合法 JSON。");
  }
  validateBackupPayload(parsed);
  return parsed;
}

export function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("备份文件结构无效。");
  }

  if (payload.schemaVersion !== DB_VERSION) {
    throw new Error(`备份 schemaVersion 不匹配，当前版本为 ${DB_VERSION}。`);
  }

  if (typeof payload.exportedAt !== "string" || Number.isNaN(Date.parse(payload.exportedAt))) {
    throw new Error("备份文件缺少有效 exportedAt。");
  }

  if (!payload.data || typeof payload.data !== "object") {
    throw new Error("备份文件缺少 data。");
  }

  for (const storeName of REQUIRED_STORES) {
    if (!Array.isArray(payload.data[storeName])) {
      throw new Error(`备份文件缺少 ${storeName} 数据。`);
    }
  }
}

export async function importBackupPayload(payload) {
  validateBackupPayload(payload);
  await replaceStores(payload.data);
}

export async function importBackupFile(file) {
  const text = await file.text();
  const payload = parseBackupJson(text);
  await importBackupPayload(payload);
  globalThis.location?.reload();
}

