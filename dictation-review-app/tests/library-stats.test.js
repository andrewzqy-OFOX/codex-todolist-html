import test from "node:test";
import assert from "node:assert/strict";

import { summarizeLibraryStats } from "../public/js/ui.js";

function masteredTrack() {
  return {
    status: "mastered",
    active: true,
    totalCorrect: 6,
    totalWrong: 1,
    nextReviewDate: "2026-09-20"
  };
}

test("library stats summarize totals, mastered, archived, and recent accuracy by category", () => {
  const items = [
    {
      id: "english-active",
      type: "english_word",
      text: "present",
      status: "active",
      spellingTrack: masteredTrack(),
      phoneticTrack: masteredTrack()
    },
    {
      id: "english-archived",
      type: "english_word",
      text: "guy",
      status: "archived",
      spellingTrack: masteredTrack(),
      phoneticTrack: masteredTrack()
    },
    {
      id: "chinese-active",
      type: "chinese_phrase",
      text: "坚持",
      status: "active",
      wholeItemTrack: { ...masteredTrack(), status: "learning" },
      characterTracks: {}
    },
    {
      id: "poem-line",
      type: "poem_line",
      text: "海内存知己",
      status: "active",
      wholeItemTrack: masteredTrack(),
      characterTracks: {}
    },
    {
      id: "poem-parent",
      type: "poem",
      text: "送杜少府之任蜀州",
      status: "active"
    }
  ];

  const events = [
    { itemId: "english-active", date: "2026-07-22", result: "correct" },
    { itemId: "english-active", date: "2026-07-21", result: "incorrect" },
    { itemId: "chinese-active", date: "2026-07-20", result: "correct" },
    { itemId: "poem-line", date: "2026-07-16", result: "correct" },
    { itemId: "poem-line", date: "2026-07-15", result: "incorrect" }
  ];

  const stats = summarizeLibraryStats(items, events, "2026-07-22");

  assert.equal(stats.all.total, 4);
  assert.equal(stats.all.mastered, 2);
  assert.equal(stats.all.archived, 1);
  assert.equal(stats.all.recentAccuracy, 75);
  assert.equal(stats.english.total, 2);
  assert.equal(stats.english.mastered, 1);
  assert.equal(stats.english.archived, 1);
  assert.equal(stats.english.recentAccuracy, 50);
  assert.equal(stats.chinese.recentAccuracy, 100);
  assert.equal(stats.poem.recentAccuracy, 100);
});
