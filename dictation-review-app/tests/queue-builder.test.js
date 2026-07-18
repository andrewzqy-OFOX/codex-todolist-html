import test from "node:test";
import assert from "node:assert/strict";

import { buildTodayQueue, buildTodayStats, filterQueueByMode, scheduleSameDayRetry } from "../public/js/queue-builder.js";
import { createChineseItem, createEnglishItem } from "../public/js/review-engine.js";
import { ENGLISH_DIMENSIONS, TRACK_STATUSES } from "../public/js/review-types.js";

test("Chinese mode includes character reinforcement for Chinese terms", () => {
  const item = createChineseItem({
    id: "phrase-with-character",
    text: "坚持",
    today: "2026-07-01",
    wholeItemTrack: {
      stage: 1,
      correctStreak: 1,
      totalCorrect: 1,
      totalWrong: 0,
      nextReviewDate: "2026-07-19",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-18"
    },
    characterTracks: {
      持: {
        character: "持",
        active: true,
        stage: 1,
        correctStreak: 1,
        totalCorrect: 1,
        totalWrong: 1,
        nextReviewDate: "2026-07-18",
        status: TRACK_STATUSES.learning,
        lastReviewedDate: "2026-07-17"
      }
    }
  });

  const queue = buildTodayQueue([item], "2026-07-18");
  const chineseQueue = filterQueueByMode(queue, "chinese");

  assert.equal(chineseQueue.length, 1);
  assert.equal(chineseQueue[0].cardType, "character");
});

test("today stats match the visible start-button categories", () => {
  const english = createEnglishItem({ id: "english-1", text: "example", today: "2026-07-18" });
  const chinese = createChineseItem({ id: "chinese-1", text: "坚持", today: "2026-07-18" });
  const poem = createChineseItem({ id: "poem-1", text: "海内存知己", today: "2026-07-18", type: "poem_line" });

  const stats = buildTodayStats([english, chinese, poem], "2026-07-18");

  assert.equal(stats.englishCount, 1);
  assert.equal(stats.chineseCount, 1);
  assert.equal(stats.poemCount, 1);
  assert.equal(stats.totalCount, 3);
});

test("today queue includes overdue, due, and newly confirmed items without overdue penalty", () => {
  const overdue = createChineseItem({
    id: "old",
    text: "坚持",
    today: "2026-07-01",
    wholeItemTrack: {
      stage: 2,
      correctStreak: 2,
      totalCorrect: 2,
      totalWrong: 0,
      nextReviewDate: "2026-07-10",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-07"
    }
  });
  const due = createChineseItem({ id: "due", text: "努力", today: "2026-07-18" });
  const future = createChineseItem({
    id: "future",
    text: "认真",
    today: "2026-07-01",
    wholeItemTrack: {
      stage: 1,
      correctStreak: 1,
      totalCorrect: 1,
      totalWrong: 0,
      nextReviewDate: "2026-07-19",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-18"
    }
  });
  const newToday = createEnglishItem({
    id: "new",
    text: "example",
    today: "2026-07-18",
    spellingTrack: {
      stage: 1,
      correctStreak: 1,
      totalCorrect: 1,
      totalWrong: 0,
      nextReviewDate: "2026-07-19",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-18"
    },
    phoneticTrack: {
      stage: 1,
      correctStreak: 1,
      totalCorrect: 1,
      totalWrong: 0,
      nextReviewDate: "2026-07-19",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-18"
    }
  });

  const queue = buildTodayQueue([overdue, due, future, newToday], "2026-07-18");
  const ids = queue.map((card) => card.itemId);

  assert.deepEqual(ids.sort(), ["due", "new", "old"]);
  assert.equal(overdue.wholeItemTrack.stage, 2);
});

test("English due dimensions are merged into one card when both are due", () => {
  const item = createEnglishItem({ id: "word-1", text: "example", today: "2026-07-18" });
  const queue = buildTodayQueue([item], "2026-07-18");

  assert.equal(queue.length, 1);
  assert.equal(queue[0].cardType, "english");
  assert.deepEqual(queue[0].dimensions, [ENGLISH_DIMENSIONS.spelling, ENGLISH_DIMENSIONS.phonetic]);
});

test("English queue tests only the due dimension when one dimension is due", () => {
  const item = createEnglishItem({
    id: "word-1",
    text: "example",
    today: "2026-07-01",
    spellingTrack: {
      stage: 1,
      correctStreak: 1,
      totalCorrect: 1,
      totalWrong: 0,
      nextReviewDate: "2026-07-18",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-17"
    },
    phoneticTrack: {
      stage: 1,
      correctStreak: 1,
      totalCorrect: 1,
      totalWrong: 0,
      nextReviewDate: "2026-07-19",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-17"
    }
  });

  const queue = buildTodayQueue([item], "2026-07-18");

  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0].dimensions, [ENGLISH_DIMENSIONS.spelling]);
});

test("due character reinforcement cards avoid consecutive same character when possible", () => {
  const first = createChineseItem({
    id: "a",
    text: "坚持",
    today: "2026-07-01",
    wholeItemTrack: {
      stage: 1,
      correctStreak: 1,
      totalCorrect: 1,
      totalWrong: 0,
      nextReviewDate: "2026-07-19",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-18"
    },
    characterTracks: {
      持: {
        character: "持",
        active: true,
        stage: 1,
        correctStreak: 1,
        totalCorrect: 1,
        totalWrong: 1,
        nextReviewDate: "2026-07-18",
        status: TRACK_STATUSES.learning,
        lastReviewedDate: "2026-07-17"
      }
    }
  });
  const second = createChineseItem({
    id: "b",
    text: "维持",
    today: "2026-07-01",
    wholeItemTrack: first.wholeItemTrack,
    characterTracks: first.characterTracks
  });
  const third = createChineseItem({
    id: "c",
    text: "认真",
    today: "2026-07-01",
    wholeItemTrack: first.wholeItemTrack,
    characterTracks: {
      真: {
        ...first.characterTracks["持"],
        character: "真"
      }
    }
  });

  const queue = buildTodayQueue([first, second, third], "2026-07-18");

  for (let i = 1; i < queue.length; i += 1) {
    assert.notEqual(queue[i - 1].character, queue[i].character);
  }
});

test("same-day retry waits at least three cards or goes to round end, with max retry cap", () => {
  const failedCard = { id: "card-a", itemId: "a", retryCount: 0 };
  const queue = [{ id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];

  const scheduled = scheduleSameDayRetry(queue, failedCard);
  assert.equal(scheduled.scheduled, true);
  assert.equal(scheduled.queue[3].isRetry, true);

  const shortQueue = scheduleSameDayRetry([{ id: "b" }], failedCard);
  assert.equal(shortQueue.queue[1].isRetry, true);

  const capped = scheduleSameDayRetry(queue, { ...failedCard, retryCount: 3 });
  assert.equal(capped.scheduled, false);
  assert.equal(capped.message, "明天继续复习");
});
