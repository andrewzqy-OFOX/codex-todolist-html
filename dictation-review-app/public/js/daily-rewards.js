import { addDays, assertLocalDate } from "./date-utils.js";

export const TODO_LIST_STORAGE_KEY = "pretty-todo-list-v2";
export const SHARED_REWARD_LEDGER_KEY = "xiaokui-shared-reward-ledger-v1";

export function calculateAchievement({ targetCount = 0, completedCount = 0 } = {}) {
  const target = Math.max(0, Number(targetCount) || 0);
  const completed = Math.max(0, Math.min(Number(completedCount) || 0, target || Number(completedCount) || 0));
  const rate = target ? Math.round((completed / target) * 100) : 0;
  let rewardAmount = 0;
  let status = "none";

  if (target > 0) {
    if (rate === 100) {
      rewardAmount = 2;
      status = "perfect";
    } else if (rate >= 85) {
      rewardAmount = 1;
      status = "good";
    } else if (rate < 60) {
      rewardAmount = -1;
      status = "penalty";
    } else {
      status = "partial";
    }
  }

  return {
    targetCount: target,
    completedCount: completed,
    rate,
    rewardAmount,
    status
  };
}

export function mergeDailyAchievement(existingRecord, patch, date) {
  assertLocalDate(date, "date");
  const targetCount = Math.max(existingRecord?.targetCount || 0, patch.targetCount || 0, patch.completedCount || 0);
  const completedCount = Math.min(targetCount, (existingRecord?.completedCount || 0) + (patch.completedCount || 0));
  const calculated = calculateAchievement({ targetCount, completedCount });

  return {
    date,
    ...calculated,
    updatedAt: new Date().toISOString()
  };
}

export function upsertDailyAchievement(records = {}, date, patch) {
  const next = { ...records };
  next[date] = mergeDailyAchievement(next[date], patch, date);
  return next;
}

export function rewardRedeemed(redemptions = []) {
  return (Array.isArray(redemptions) ? redemptions : []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

export function rewardBalance(records = {}, redemptions = []) {
  return Object.values(records).reduce((sum, record) => sum + (Number(record.rewardAmount) || 0), 0) - rewardRedeemed(redemptions);
}

function tasksForTodoDate(data, date) {
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  return tasks.filter((task) => {
    if (task.type !== "daily") return task.date === date;
    const startDate = String(task.createdAt || "").slice(0, 10);
    return !startDate || startDate <= date;
  });
}

function todoDayStats(data, date) {
  const tasks = tasksForTodoDate(data, date);
  const completions = data?.completions?.[date] || {};
  const done = tasks.filter((task) => completions[task.id]).length;
  return { total: tasks.length, done, left: tasks.length - done };
}

function hasTodoCompletionRecord(data, date) {
  return Boolean(data?.completions?.[date] && Object.keys(data.completions[date]).length);
}

function confirmedTodoDatesAscending(data) {
  return [...new Set([
    ...Object.keys(data?.confirmations || {}),
    ...Object.keys(data?.completions || {}).filter((date) => hasTodoCompletionRecord(data, date))
  ])].sort();
}

export function calculateTodoListRewardSummary(todoData = {}, sharedEntries = []) {
  const todoRedeemed = (Array.isArray(todoData.redemptions) ? todoData.redemptions : []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const shared = (Array.isArray(sharedEntries) ? sharedEntries : []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const sharedRedeemed = (Array.isArray(sharedEntries) ? sharedEntries : [])
    .filter((item) => Number(item.amount) < 0)
    .reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0);
  const redeemed = todoRedeemed + sharedRedeemed;
  let earned = 0;
  let penalty = 0;
  let incompleteStreak = 0;
  let completeStreak = 0;

  confirmedTodoDatesAscending(todoData).forEach((date) => {
    const stats = todoDayStats(todoData, date);
    const completed = stats.total > 0 && stats.left === 0;

    if (completed) {
      earned += 2;
      completeStreak += 1;
      incompleteStreak = 0;
      if (completeStreak % 7 === 0) earned += 10;
    } else {
      completeStreak = 0;
      incompleteStreak += 1;
      if (incompleteStreak % 2 === 0) penalty += 3;
    }
  });

  return {
    earned,
    penalty,
    redeemed,
    shared,
    balance: 10 + earned - penalty - todoRedeemed + shared
  };
}

function readJsonFromStorage(storage, key, fallback) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonToStorage(storage, key, value) {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readSharedRewardLedger(storage = globalThis.localStorage) {
  const value = readJsonFromStorage(storage, SHARED_REWARD_LEDGER_KEY, []);
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
}

export function readTodoListRewardBridge(storage = globalThis.localStorage) {
  const todoData = readJsonFromStorage(storage, TODO_LIST_STORAGE_KEY, null);
  if (!todoData || typeof todoData !== "object") return null;
  return calculateTodoListRewardSummary(todoData, readSharedRewardLedger(storage));
}

export function syncDictationRewardToSharedLedger(record, storage = globalThis.localStorage) {
  if (!record?.date || !record.targetCount) return false;

  const entries = readSharedRewardLedger(storage);
  const id = `dictation-review:${record.date}`;
  const entry = {
    id,
    source: "dictation-review",
    label: "小葵の背默",
    date: record.date,
    amount: Number(record.rewardAmount) || 0,
    rate: Number(record.rate) || 0,
    updatedAt: new Date().toISOString()
  };
  const index = entries.findIndex((item) => item.id === id);
  const next = [...entries];
  if (index >= 0) next[index] = entry;
  else next.push(entry);
  return writeJsonToStorage(storage, SHARED_REWARD_LEDGER_KEY, next);
}

export function createRewardRedemption({ product, amount } = {}, now = new Date()) {
  const name = String(product || "").trim();
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  if (!name || value <= 0) {
    throw new Error("请输入抵扣内容和正确金额。");
  }

  return {
    id: globalThis.crypto?.randomUUID?.() || `redemption-${now.getTime()}-${Math.random().toString(16).slice(2)}`,
    product: name,
    amount: value,
    createdAt: now.toISOString()
  };
}

export function syncRewardRedemptionToSharedLedger(redemption, storage = globalThis.localStorage) {
  if (!redemption?.id || !redemption.product || !(Number(redemption.amount) > 0)) return false;

  const entries = readSharedRewardLedger(storage);
  const id = `dictation-redemption:${redemption.id}`;
  const entry = {
    id,
    source: "dictation-redemption",
    label: redemption.product,
    date: String(redemption.createdAt || "").slice(0, 10),
    amount: -Math.round((Number(redemption.amount) || 0) * 100) / 100,
    product: redemption.product,
    updatedAt: new Date().toISOString()
  };
  const index = entries.findIndex((item) => item.id === id);
  const next = [...entries];
  if (index >= 0) next[index] = entry;
  else next.push(entry);
  return writeJsonToStorage(storage, SHARED_REWARD_LEDGER_KEY, next);
}

export function recentSevenDays(today) {
  assertLocalDate(today, "today");
  return Array.from({ length: 7 }, (_, index) => addDays(today, -index));
}

export function summarizeRecent(records = {}, today) {
  return recentSevenDays(today).map((date) => ({
    date,
    ...(records[date] || calculateAchievement())
  }));
}
