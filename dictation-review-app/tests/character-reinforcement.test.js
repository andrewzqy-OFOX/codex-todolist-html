import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchCharacterRecommendations,
  makeManualRelatedWord,
  safeFetchCharacterRecommendations,
  sanitizeRelatedWords
} from "../public/js/character-reinforcement.js";
import { applyCharacterFeedback, applyChineseFeedback, createChineseItem } from "../public/js/review-engine.js";
import { getCardView, recordCardResult, takeNextCard, createDictationSession } from "../public/js/dictation-session.js";
import { addItem, getAllItems, getItem, resetDatabaseForTests } from "../public/js/db.js";
import { buildTodayQueue } from "../public/js/queue-builder.js";
import { CHINESE_FEEDBACK, REVIEW_RESULTS, TRACK_STATUSES } from "../public/js/review-types.js";

test.beforeEach(async () => {
  await resetDatabaseForTests();
});

function characterEnvelope(words) {
  return {
    success: true,
    data: {
      character: "涯",
      pinyin: "ya",
      relatedWords: words
    },
    confidence: "high",
    warnings: [],
    ambiguities: [],
    sources: [{ title: "Dictionary", publisher: "Test", url: "https://example.com" }],
    fetchedAt: "2026-07-18T00:00:00.000Z"
  };
}

test("single character recommendation is fetched and filtered", async () => {
  const result = await fetchCharacterRecommendations("涯", "天涯若比邻", {
    fetchImpl: async () => ({
      ok: true,
      json: async () => characterEnvelope([
        { word: "海涯", pinyin: "hai ya", definition: "海边" }
      ])
    })
  });

  assert.equal(result.data.relatedWords.length, 1);
  assert.equal(result.data.relatedWords[0].word, "海涯");
  assert.equal(result.fromCache, false);
});

test("related words are capped at two and must contain the target character", () => {
  const words = sanitizeRelatedWords("涯", "天涯若比邻", [
    { word: "海涯" },
    { word: "涯际" },
    { word: "边际" },
    { word: "生涯" }
  ]);

  assert.deepEqual(words.map((word) => word.word), ["海涯", "涯际"]);
});

test("parent can cancel recommendations and keep only the original character track", () => {
  const item = createChineseItem({ id: "line-1", text: "天涯若比邻", today: "2026-07-18", type: "poem_line" });
  const next = applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: [{ char: "涯", index: 1 }],
    relatedWordsByCharacter: {}
  }).item;

  assert.equal(next.characterTracks["涯"].active, true);
  assert.deepEqual(next.characterTracks["涯"].relatedWords, []);
});

test("manual related word is saved only inside the character track", async () => {
  const manual = makeManualRelatedWord("涯", {
    word: "生涯",
    pinyin: "sheng ya",
    definition: "人生经历"
  });
  const item = createChineseItem({ id: "line-1", text: "天涯若比邻", today: "2026-07-18", type: "poem_line" });
  const saved = await addItem(applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: [{ char: "涯", index: 1 }],
    relatedWordsByCharacter: { 涯: [manual] }
  }).item);

  const items = await getAllItems(true);
  assert.equal(saved.characterTracks["涯"].relatedWords[0].word, "生涯");
  assert.equal(items.length, 1);
});

test("reinforcement carrier rotates through original and confirmed related words", () => {
  let item = createChineseItem({ id: "line-1", text: "天涯若比邻", today: "2026-07-18", type: "poem_line" });
  item = applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: [{ char: "涯", index: 1 }],
    relatedWordsByCharacter: {
      涯: [
        { word: "海涯", pinyin: "hai ya", definition: "海边" },
        { word: "生涯", pinyin: "sheng ya", definition: "人生经历" }
      ]
    }
  }).item;

  let view = getCardView({
    cardType: "character",
    character: "涯",
    characterTrack: item.characterTracks["涯"],
    itemSnapshot: item
  });
  assert.equal(view.characterCarrier.text, "海涯");

  item = applyCharacterFeedback(item, { today: "2026-07-19", character: "涯", result: REVIEW_RESULTS.correct }).item;
  view = getCardView({
    cardType: "character",
    character: "涯",
    characterTrack: item.characterTracks["涯"],
    itemSnapshot: item
  });
  assert.equal(view.characterCarrier.text, "生涯");
});

test("three formal correct reinforcement reviews exit after 3 and 7 day intervals", () => {
  let item = createChineseItem({ id: "line-1", text: "天涯若比邻", today: "2026-07-18", type: "poem_line" });
  item = applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: [{ char: "涯", index: 1 }]
  }).item;

  item = applyCharacterFeedback(item, { today: "2026-07-19", character: "涯", result: REVIEW_RESULTS.correct }).item;
  assert.equal(item.characterTracks["涯"].nextReviewDate, "2026-07-22");

  item = applyCharacterFeedback(item, { today: "2026-07-22", character: "涯", result: REVIEW_RESULTS.correct }).item;
  assert.equal(item.characterTracks["涯"].nextReviewDate, "2026-07-29");

  item = applyCharacterFeedback(item, { today: "2026-07-29", character: "涯", result: REVIEW_RESULTS.correct }).item;
  assert.equal(item.characterTracks["涯"].status, TRACK_STATUSES.mastered);
  assert.equal(item.characterTracks["涯"].active, false);
});

test("same-day correct retry does not count toward reinforcement exit", () => {
  let item = createChineseItem({ id: "line-1", text: "天涯若比邻", today: "2026-07-18", type: "poem_line" });
  item = applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: [{ char: "涯", index: 1 }]
  }).item;
  const before = item.characterTracks["涯"];
  item = applyCharacterFeedback(item, {
    today: "2026-07-18",
    character: "涯",
    result: REVIEW_RESULTS.correct,
    isSameDayRetry: true
  }).item;

  assert.deepEqual(item.characterTracks["涯"], before);
});

test("wrong reinforcement review resets and keeps the track active", () => {
  let item = createChineseItem({ id: "line-1", text: "天涯若比邻", today: "2026-07-18", type: "poem_line" });
  item = applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: [{ char: "涯", index: 1 }]
  }).item;
  item = applyCharacterFeedback(item, { today: "2026-07-19", character: "涯", result: REVIEW_RESULTS.correct }).item;
  item = applyCharacterFeedback(item, { today: "2026-07-22", character: "涯", result: REVIEW_RESULTS.wrong }).item;

  assert.equal(item.characterTracks["涯"].stage, 0);
  assert.equal(item.characterTracks["涯"].correctStreak, 0);
  assert.equal(item.characterTracks["涯"].nextReviewDate, "2026-07-23");
  assert.equal(item.characterTracks["涯"].active, true);
});

test("same character is reactivated after later regular wrong feedback", () => {
  const item = createChineseItem({
    id: "line-1",
    text: "天涯若比邻",
    today: "2026-07-18",
    type: "poem_line",
    characterTracks: {
      涯: {
        character: "涯",
        originalItemId: "line-1",
        wrongCount: 1,
        active: false,
        stage: 3,
        correctStreak: 3,
        totalCorrect: 3,
        totalWrong: 1,
        nextReviewDate: "2026-07-29",
        status: TRACK_STATUSES.mastered,
        relatedWords: [],
        currentRotationIndex: 0,
        lastReviewedDate: "2026-07-29"
      }
    }
  });

  const next = applyChineseFeedback(item, {
    today: "2026-08-01",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: [{ char: "涯", index: 1 }]
  }).item;

  assert.equal(next.characterTracks["涯"].active, true);
  assert.equal(next.characterTracks["涯"].stage, 0);
  assert.equal(next.characterTracks["涯"].nextReviewDate, "2026-08-02");
});

test("network failure still allows original wrong-character review to be saved", async () => {
  const result = await safeFetchCharacterRecommendations("涯", "天涯若比邻", {
    fetchImpl: async () => {
      throw new Error("network down");
    }
  });
  assert.equal(result.success, false);

  const item = await addItem(createChineseItem({ id: "line-1", text: "天涯若比邻", today: "2026-07-18", type: "poem_line" }));
  let session = takeNextCard(createDictationSession(buildTodayQueue([item], "2026-07-18"), [item], { today: "2026-07-18", mode: "poem" }));
  session = await recordCardResult(session, {
    kind: "partial_wrong",
    wrongCharacters: [{ char: "涯", index: 1 }],
    relatedWordsByCharacter: {}
  });

  const saved = await getItem(item.id);
  assert.equal(session.stats.poemWrongCharCount, 1);
  assert.ok(saved.characterTracks["涯"]);
  assert.deepEqual(saved.characterTracks["涯"].relatedWords, []);
});
