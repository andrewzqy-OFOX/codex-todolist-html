import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateAchievement,
  calculateTodoListRewardSummary,
  createRewardRedemption,
  mergeDailyAchievement,
  recentSevenDays,
  readTodoListRewardBridge,
  rewardBalance,
  rewardRedeemed,
  SHARED_REWARD_LEDGER_KEY,
  summarizeRecent,
  syncDictationRewardToSharedLedger,
  syncRewardRedemptionToSharedLedger,
  TODO_LIST_STORAGE_KEY,
  upsertDailyAchievement
} from "../public/js/daily-rewards.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test("daily reward gives 2 yuan for 100 percent completion", () => {
  assert.deepEqual(calculateAchievement({ targetCount: 10, completedCount: 10 }), {
    targetCount: 10,
    completedCount: 10,
    rate: 100,
    rewardAmount: 2,
    status: "perfect"
  });
});

test("daily reward gives 1 yuan for at least 85 percent completion", () => {
  const result = calculateAchievement({ targetCount: 20, completedCount: 17 });
  assert.equal(result.rate, 85);
  assert.equal(result.rewardAmount, 1);
  assert.equal(result.status, "good");
});

test("daily reward deducts 1 yuan below 60 percent completion", () => {
  const result = calculateAchievement({ targetCount: 10, completedCount: 5 });
  assert.equal(result.rate, 50);
  assert.equal(result.rewardAmount, -1);
  assert.equal(result.status, "penalty");
});

test("partial completion from 60 to 84 percent has no money change", () => {
  const result = calculateAchievement({ targetCount: 10, completedCount: 7 });
  assert.equal(result.rate, 70);
  assert.equal(result.rewardAmount, 0);
  assert.equal(result.status, "partial");
});

test("multiple sessions on the same day accumulate completed formal cards", () => {
  let records = upsertDailyAchievement({}, "2026-07-18", { targetCount: 10, completedCount: 4 });
  records = upsertDailyAchievement(records, "2026-07-18", { targetCount: 10, completedCount: 6 });

  assert.equal(records["2026-07-18"].completedCount, 10);
  assert.equal(records["2026-07-18"].rate, 100);
  assert.equal(records["2026-07-18"].rewardAmount, 2);
});

test("achievement merge keeps the largest known target count", () => {
  const first = mergeDailyAchievement(null, { targetCount: 8, completedCount: 4 }, "2026-07-18");
  const second = mergeDailyAchievement(first, { targetCount: 5, completedCount: 1 }, "2026-07-18");

  assert.equal(second.targetCount, 8);
  assert.equal(second.completedCount, 5);
});

test("reward balance sums daily records", () => {
  const balance = rewardBalance({
    a: { rewardAmount: 2 },
    b: { rewardAmount: 1 },
    c: { rewardAmount: -1 }
  });

  assert.equal(balance, 2);
});

test("reward balance subtracts redemption records", () => {
  const records = {
    a: { rewardAmount: 2 },
    b: { rewardAmount: 1 }
  };
  const redemptions = [{ amount: 1.5 }, { amount: 0.5 }];

  assert.equal(rewardRedeemed(redemptions), 2);
  assert.equal(rewardBalance(records, redemptions), 1);
});

test("recent seven day summary includes today and six previous days", () => {
  const days = recentSevenDays("2026-01-02");
  assert.deepEqual(days, [
    "2026-01-02",
    "2026-01-01",
    "2025-12-31",
    "2025-12-30",
    "2025-12-29",
    "2025-12-28",
    "2025-12-27"
  ]);
});

test("recent summary fills missing days with empty records", () => {
  const summary = summarizeRecent({
    "2026-07-18": { targetCount: 4, completedCount: 4, rate: 100, rewardAmount: 2, status: "perfect" }
  }, "2026-07-18");

  assert.equal(summary.length, 7);
  assert.equal(summary[0].status, "perfect");
  assert.equal(summary[1].targetCount, 0);
});

test("todo-list reward bridge includes shared dictation ledger entries", () => {
  const todoData = {
    tasks: [{ id: "daily-1", type: "daily", createdAt: "2026-07-18" }],
    completions: { "2026-07-18": { "daily-1": true } },
    confirmations: { "2026-07-18": "2026-07-18T12:00:00.000Z" },
    redemptions: [{ amount: 1 }]
  };

  const result = calculateTodoListRewardSummary(todoData, [{ amount: 2 }, { amount: -1 }]);

  assert.equal(result.earned, 2);
  assert.equal(result.redeemed, 2);
  assert.equal(result.shared, 1);
  assert.equal(result.balance, 12);
});

test("dictation reward sync upserts one shared ledger entry per date", () => {
  const storage = memoryStorage();

  assert.equal(syncDictationRewardToSharedLedger({
    date: "2026-07-18",
    targetCount: 5,
    rewardAmount: 2,
    rate: 100
  }, storage), true);
  assert.equal(syncDictationRewardToSharedLedger({
    date: "2026-07-18",
    targetCount: 5,
    rewardAmount: 1,
    rate: 85
  }, storage), true);

  const entries = JSON.parse(storage.getItem(SHARED_REWARD_LEDGER_KEY));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "dictation-review:2026-07-18");
  assert.equal(entries[0].amount, 1);
});

test("dictation app reads todo-list balance when both apps share one origin", () => {
  const todoData = {
    tasks: [{ id: "daily-1", type: "daily", createdAt: "2026-07-18" }],
    completions: { "2026-07-18": { "daily-1": true } },
    confirmations: { "2026-07-18": "2026-07-18T12:00:00.000Z" },
    redemptions: []
  };
  const storage = memoryStorage({
    [TODO_LIST_STORAGE_KEY]: JSON.stringify(todoData),
    [SHARED_REWARD_LEDGER_KEY]: JSON.stringify([{ amount: 2 }])
  });

  const bridge = readTodoListRewardBridge(storage);

  assert.equal(bridge.balance, 14);
  assert.equal(bridge.shared, 2);
});

test("reward redemption validates input and syncs to shared ledger as a deduction", () => {
  const storage = memoryStorage();
  const redemption = createRewardRedemption({
    product: "漫画书",
    amount: "3.456"
  }, new Date("2026-07-18T08:30:00.000Z"));

  assert.equal(redemption.product, "漫画书");
  assert.equal(redemption.amount, 3.46);
  assert.equal(syncRewardRedemptionToSharedLedger(redemption, storage), true);

  const entries = JSON.parse(storage.getItem(SHARED_REWARD_LEDGER_KEY));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, `dictation-redemption:${redemption.id}`);
  assert.equal(entries[0].amount, -3.46);
});

test("reward redemption rejects missing product or invalid amount", () => {
  assert.throws(() => createRewardRedemption({ product: "", amount: 1 }), /抵扣/);
  assert.throws(() => createRewardRedemption({ product: "文具", amount: 0 }), /抵扣/);
});
