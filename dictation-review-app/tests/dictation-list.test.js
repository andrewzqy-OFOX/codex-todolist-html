import test from "node:test";
import assert from "node:assert/strict";

import { dictationListLabel, formatAccuracyRatio, quickFeedbackForCard } from "../public/js/dictation-list.js";

const englishItem = {
  id: "english-1",
  text: "present",
  spellingTrack: { totalCorrect: 4, totalWrong: 1 },
  phoneticTrack: { totalCorrect: 3, totalWrong: 0 }
};

test("quick list formats item accuracy as correct over total", () => {
  assert.equal(formatAccuracyRatio(englishItem), "7/8");
});

test("quick list maps wrong English feedback by due dimensions", () => {
  assert.deepEqual(quickFeedbackForCard({
    cardType: "english",
    dimensions: ["spelling", "phonetic"]
  }, false), { kind: "both_wrong" });

  assert.deepEqual(quickFeedbackForCard({
    cardType: "english",
    dimensions: ["spelling"]
  }, false), { kind: "wrong" });

  assert.deepEqual(quickFeedbackForCard({
    cardType: "english",
    dimensions: ["phonetic"]
  }, false), { kind: "wrong" });
});

test("quick list maps Chinese and poem wrong feedback to whole item unknown", () => {
  assert.deepEqual(quickFeedbackForCard({ cardType: "whole_item", dimensions: ["whole_item"] }, false), {
    kind: "entire_unknown"
  });
});

test("quick list keeps character reinforcement target visible for parent", () => {
  assert.equal(dictationListLabel({
    cardType: "character",
    character: "涯",
    itemSnapshot: { text: "天涯若比邻" }
  }), "天涯若比邻（目标字：涯）");
});

test("quick list maps any correct row to correct feedback", () => {
  assert.deepEqual(quickFeedbackForCard({ cardType: "whole_item" }, true), { kind: "correct" });
});
