import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

import { buildEnglishItemFromEnrichment, buildChineseItemFromEnrichment, buildPoemItemsFromEnrichment } from "../public/js/add-content.js";
import {
  createDictationSession,
  getCardView,
  loadSessionFromStorage,
  recordCardResult,
  saveSessionToStorage,
  takeNextCard,
  tokenizeText
} from "../public/js/dictation-session.js";
import { addItem, addItems, getAllFromStore, getItem, resetDatabaseForTests } from "../public/js/db.js";
import { buildTodayQueue } from "../public/js/queue-builder.js";
import { TRACK_STATUSES } from "../public/js/review-types.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
}

const englishDraft = {
  success: true,
  data: {
    normalizedWord: "present",
    ukPhonetic: "/ˈpreznt/",
    usPhonetic: "/ˈpreznt/",
    partsOfSpeech: ["noun", "adjective"],
    meaningsZh: ["礼物", "现在的"],
    alternativeCandidates: []
  },
  confidence: "high",
  warnings: [],
  ambiguities: [],
  sources: [],
  fetchedAt: "2026-07-18T00:00:00.000Z",
  originalQuery: "present"
};

const chineseDraft = {
  success: true,
  data: {
    normalizedTerm: "坚持",
    pinyin: "jian chi",
    definition: "不轻易放弃。",
    synonyms: [],
    antonyms: [],
    pronunciationCandidates: []
  },
  confidence: "high",
  warnings: [],
  ambiguities: [],
  sources: [],
  fetchedAt: "2026-07-18T00:00:00.000Z",
  originalQuery: "坚持"
};

const poemDraft = {
  success: true,
  data: {
    title: "静夜思",
    alternativeTitle: "",
    author: "李白",
    dynasty: "唐",
    fullText: "床前明月光，疑是地上霜。",
    lines: [
      { order: 1, text: "床前明月光，" },
      { order: 2, text: "疑是地上霜。" }
    ],
    annotations: [],
    translation: "",
    candidates: [],
    versionWarnings: []
  },
  confidence: "high",
  warnings: [],
  ambiguities: [],
  sources: [],
  fetchedAt: "2026-07-18T00:00:00.000Z",
  originalQuery: "静夜思"
};

test.beforeEach(async () => {
  await resetDatabaseForTests();
});

async function saveItem(item) {
  return addItem(item);
}

async function startSession(items, mode = "all", today = "2026-07-18") {
  const queue = buildTodayQueue(items, today);
  return takeNextCard(createDictationSession(queue, items, { today, mode }));
}

test("English spelling-only card hides spelling and updates only spelling track", async () => {
  const item = await saveItem({
    ...buildEnglishItemFromEnrichment(englishDraft, "present", "2026-07-18"),
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
  let session = await startSession([item], "english");
  const view = getCardView(session.currentCard);

  assert.equal(view.feedbackMode, "english_spelling");
  assert.equal(view.promptLines.join(" ").includes("present"), false);

  session = await recordCardResult(session, { kind: "wrong" });
  const saved = await getItem(item.id);
  assert.equal(saved.spellingTrack.totalWrong, 1);
  assert.equal(saved.phoneticTrack.totalWrong, 0);
  assert.equal(saved.phoneticTrack.nextReviewDate, "2026-07-19");
});

test("English phonetic-only card shows word and updates only phonetic track", async () => {
  const item = await saveItem({
    ...buildEnglishItemFromEnrichment(englishDraft, "present", "2026-07-18"),
    spellingTrack: {
      stage: 1,
      correctStreak: 1,
      totalCorrect: 1,
      totalWrong: 0,
      nextReviewDate: "2026-07-19",
      status: TRACK_STATUSES.learning,
      lastReviewedDate: "2026-07-17"
    }
  });
  let session = await startSession([item], "english");
  const view = getCardView(session.currentCard);

  assert.equal(view.feedbackMode, "english_phonetic");
  assert.equal(view.promptLines.join(" ").includes("present"), true);

  session = await recordCardResult(session, { kind: "wrong" });
  const saved = await getItem(item.id);
  assert.equal(saved.spellingTrack.totalWrong, 0);
  assert.equal(saved.phoneticTrack.totalWrong, 1);
});

test("English card with both dimensions supports spelling-only error", async () => {
  const item = await saveItem(buildEnglishItemFromEnrichment(englishDraft, "present", "2026-07-18"));
  let session = await startSession([item], "english");
  assert.equal(getCardView(session.currentCard).feedbackMode, "english_both");

  session = await recordCardResult(session, { kind: "spelling_wrong" });
  const saved = await getItem(item.id);
  assert.equal(saved.spellingTrack.totalWrong, 1);
  assert.equal(saved.phoneticTrack.totalCorrect, 1);
});

test("Chinese feedback records one wrong character by position", async () => {
  const item = await saveItem(buildChineseItemFromEnrichment(chineseDraft, "坚持", "2026-07-18"));
  let session = await startSession([item], "chinese");

  session = await recordCardResult(session, {
    kind: "partial_wrong",
    wrongCharacters: [{ char: "持", index: 1 }],
    studentAnswer: "坚诗"
  });

  const saved = await getItem(item.id);
  const events = await getAllFromStore("reviewEvents");
  assert.ok(saved.characterTracks["持"]);
  assert.deepEqual(events[0].wrongCharacters, [{ char: "持", index: 1 }]);
  assert.equal(events[0].studentAnswer, "坚诗");
});

test("Chinese feedback records multiple wrong characters", async () => {
  const item = await saveItem(buildChineseItemFromEnrichment(chineseDraft, "坚持", "2026-07-18"));
  let session = await startSession([item], "chinese");

  session = await recordCardResult(session, {
    kind: "partial_wrong",
    wrongCharacters: [
      { char: "坚", index: 0 },
      { char: "持", index: 1 }
    ]
  });

  const saved = await getItem(item.id);
  assert.ok(saved.characterTracks["坚"]);
  assert.ok(saved.characterTracks["持"]);
  assert.equal(session.stats.chineseWrongCharCount, 2);
});

test("entire Chinese item unknown does not create character tracks", async () => {
  const item = await saveItem(buildChineseItemFromEnrichment(chineseDraft, "坚持", "2026-07-18"));
  let session = await startSession([item], "chinese");

  session = await recordCardResult(session, { kind: "entire_unknown" });
  const saved = await getItem(item.id);

  assert.equal(saved.wholeItemTrack.totalWrong, 1);
  assert.deepEqual(saved.characterTracks, {});
});

test("poem punctuation is not clickable and duplicate characters keep positions", async () => {
  const [, firstLine] = buildPoemItemsFromEnrichment(poemDraft, "静夜思", "2026-07-18");
  await addItems([firstLine]);
  const tokens = tokenizeText("床前明月光，明");

  assert.equal(tokens.find((token) => token.char === "，").clickable, false);
  assert.deepEqual(tokens.filter((token) => token.char === "明").map((token) => token.index), [2, 6]);
});

test("same-day retry records retry flag and does not upgrade after correct retry", async () => {
  const item = await saveItem(buildChineseItemFromEnrichment(chineseDraft, "坚持", "2026-07-18"));
  let session = await startSession([item], "chinese");
  session = await recordCardResult(session, {
    kind: "partial_wrong",
    wrongCharacters: [{ char: "持", index: 1 }]
  });
  session = takeNextCard(session);
  assert.equal(session.currentCard.isRetry, true);

  session = await recordCardResult(session, { kind: "correct" });
  const saved = await getItem(item.id);
  const events = await getAllFromStore("reviewEvents");

  assert.equal(saved.wholeItemTrack.stage, 0);
  assert.equal(events.some((event) => event.isSameDayRetry), true);
  assert.equal(session.stats.retryCorrectCount, 1);
});

test("session can be restored after refresh", async () => {
  const item = await saveItem(buildChineseItemFromEnrichment(chineseDraft, "坚持", "2026-07-18"));
  const session = await startSession([item], "chinese");
  const storage = memoryStorage();

  saveSessionToStorage(session, storage);
  const restored = loadSessionFromStorage(storage);

  assert.equal(restored.id, session.id);
  assert.equal(restored.currentCard.itemId, item.id);
});

test("recording after a card has been cleared is rejected", async () => {
  const item = await saveItem(buildChineseItemFromEnrichment(chineseDraft, "坚持", "2026-07-18"));
  let session = await startSession([item], "chinese");
  session = await recordCardResult(session, { kind: "correct" });

  await assert.rejects(() => recordCardResult(session, { kind: "correct" }), /没有正在听写/);
});
