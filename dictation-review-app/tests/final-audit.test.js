import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

import { buildChineseItemFromEnrichment, buildEnglishItemFromEnrichment, buildPoemItemsFromEnrichment, saveConfirmedDraft } from "../public/js/add-content.js";
import { applyCharacterFeedback } from "../public/js/review-engine.js";
import { createDictationSession, getCardView, recordCardResult, takeNextCard, tokenizeText } from "../public/js/dictation-session.js";
import { addItem, addItems, getItem, getSettings, resetDatabaseForTests, updateSettings } from "../public/js/db.js";
import { buildTodayQueue } from "../public/js/queue-builder.js";
import { summarizeRecent } from "../public/js/daily-rewards.js";
import { REVIEW_RESULTS } from "../public/js/review-types.js";

const englishDraft = {
  success: true,
  data: {
    normalizedWord: "present",
    ukPhonetic: "/preznt/",
    usPhonetic: "/preznt/",
    partsOfSpeech: ["noun", "adjective", "verb"],
    meaningsZh: ["礼物", "现在的", "呈现"],
    alternativeCandidates: ["present as noun", "present as verb"]
  },
  confidence: "high",
  warnings: [],
  ambiguities: ["多义词，已保留初中常见释义。"],
  sources: [{ title: "Mock Dictionary", publisher: "Mock", url: "https://example.com/english" }],
  fetchedAt: "2026-07-18T00:00:00.000Z",
  originalQuery: "present"
};

const chineseDraft = {
  success: true,
  data: {
    normalizedTerm: "银行",
    pinyin: "yin hang",
    definition: "办理存款、贷款等业务的金融机构。",
    synonyms: ["钱庄"],
    antonyms: [],
    pronunciationCandidates: ["行：hang，也可读 xing，需按词语语境判断。"]
  },
  confidence: "high",
  warnings: [],
  ambiguities: ["多音字：行。"],
  sources: [{ title: "Mock Chinese Dictionary", publisher: "Mock", url: "https://example.com/chinese" }],
  fetchedAt: "2026-07-18T00:00:00.000Z",
  originalQuery: "银行"
};

const poemDraft = {
  success: true,
  data: {
    title: "静夜思",
    alternativeTitle: "",
    author: "李白",
    dynasty: "唐",
    fullText: "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
    lines: [
      { order: 1, text: "床前明月光，" },
      { order: 2, text: "疑是地上霜。" },
      { order: 3, text: "举头望明月，" },
      { order: 4, text: "低头思故乡。" }
    ],
    annotations: [{ term: "疑", explanation: "好像。" }],
    translation: "明亮月光洒在床前，好像地上结了一层霜。",
    candidates: [{ title: "静夜思", author: "李白", dynasty: "唐", reason: "常见教材版本。" }],
    versionWarnings: ["不同来源标点可能不同。"]
  },
  confidence: "medium",
  warnings: ["存在版本差异时需家长确认分句。"],
  ambiguities: ["同名或版本差异已提示。"],
  sources: [{ title: "Mock Poem Source", publisher: "Mock", url: "https://example.com/poem" }],
  fetchedAt: "2026-07-18T00:00:00.000Z",
  originalQuery: "静夜思"
};

test.beforeEach(async () => {
  await resetDatabaseForTests();
});

test("English full flow: confirm, spell wrong, retry same day, spelling remains due tomorrow only", async () => {
  const result = await saveConfirmedDraft("english", englishDraft);
  const item = result.items[0];
  let session = takeNextCard(createDictationSession(buildTodayQueue([item], "2026-07-18"), [item], { today: "2026-07-18", mode: "english" }));

  session = await recordCardResult(session, { kind: "spelling_wrong" });
  let saved = await getItem(item.id);

  assert.equal(saved.spellingTrack.totalWrong, 1);
  assert.equal(saved.spellingTrack.nextReviewDate, "2026-07-19");
  assert.equal(saved.phoneticTrack.totalCorrect, 1);
  assert.equal(saved.phoneticTrack.nextReviewDate, "2026-07-19");

  session = takeNextCard(session);
  assert.equal(session.currentCard.isRetry, true);
  session = await recordCardResult(session, { kind: "correct" });
  saved = await getItem(item.id);

  assert.equal(saved.spellingTrack.stage, 0);
  assert.equal(saved.spellingTrack.nextReviewDate, "2026-07-19");
  assert.equal(buildTodayQueue([saved], "2026-07-19")[0].dimensions.includes("spelling"), true);
});

test("Chinese full flow: no antonym, clicked character, confirmed related word, rotation, three dates exit", async () => {
  const item = await addItem(buildChineseItemFromEnrichment(chineseDraft, "银行", "2026-07-18"));
  let session = takeNextCard(createDictationSession(buildTodayQueue([item], "2026-07-18"), [item], { today: "2026-07-18", mode: "chinese" }));
  session = await recordCardResult(session, {
    kind: "partial_wrong",
    wrongCharacters: [{ char: "行", index: 1 }],
    relatedWordsByCharacter: {
      行: [{ word: "行走", pinyin: "xing zou", definition: "走路。" }]
    }
  });
  let saved = await getItem(item.id);

  assert.deepEqual(saved.payload.antonyms, []);
  assert.equal(saved.characterTracks["行"].relatedWords[0].word, "行走");

  let characterCard = buildTodayQueue([saved], "2026-07-19").find((card) => card.cardType === "character");
  assert.equal(getCardView({ ...characterCard, itemSnapshot: saved }).characterCarrier.text, "行走");

  saved = applyCharacterFeedback(saved, { today: "2026-07-19", character: "行", result: REVIEW_RESULTS.correct }).item;
  saved = applyCharacterFeedback(saved, { today: "2026-07-22", character: "行", result: REVIEW_RESULTS.correct }).item;
  saved = applyCharacterFeedback(saved, { today: "2026-07-29", character: "行", result: REVIEW_RESULTS.correct }).item;

  assert.equal(saved.characterTracks["行"].active, false);
  assert.equal(buildTodayQueue([saved], "2026-07-30").some((card) => card.cardType === "character"), false);
});

test("Poem full flow: parent confirmed lines are independent and wrong character enters reinforcement", async () => {
  const items = await addItems(buildPoemItemsFromEnrichment(poemDraft, "静夜思", "2026-07-18"));
  const lines = items.filter((item) => item.type === "poem_line");
  assert.equal(lines.length, 4);
  assert.notEqual(lines[0].id, lines[1].id);

  let session = takeNextCard(createDictationSession(buildTodayQueue(lines, "2026-07-18"), lines, { today: "2026-07-18", mode: "poem" }));
  session = await recordCardResult(session, {
    kind: "partial_wrong",
    wrongCharacters: [{ char: "明", index: 2 }],
    relatedWordsByCharacter: {
      明: [{ word: "明亮", pinyin: "ming liang", definition: "光线充足。" }]
    }
  });
  const savedLine = await getItem(session.completed[0].card.itemId);

  assert.ok(savedLine.characterTracks["明"]);
  assert.equal(savedLine.characterTracks["明"].relatedWords[0].word, "明亮");
  assert.equal(lines[1].wholeItemTrack.stage, 0);
});

test("Tokenizer keeps repeated characters by position and disables punctuation and spaces", () => {
  const tokens = tokenizeText("明 月，明。");

  assert.deepEqual(tokens.filter((token) => token.char === "明").map((token) => token.index), [0, 4]);
  assert.equal(tokens.find((token) => token.char === " ").clickable, false);
  assert.equal(tokens.find((token) => token.char === "，").clickable, false);
});

test("Old settings without reward records still render recent seven day summary safely", async () => {
  await updateSettings({ dailyAchievementRecords: undefined });
  const settings = await getSettings();
  const summary = summarizeRecent(settings.dailyAchievementRecords || {}, "2026-07-18");

  assert.equal(summary.length, 7);
  assert.equal(summary[0].targetCount, 0);
});

test("Today queue handles about 1000 active study items", async () => {
  const items = Array.from({ length: 1000 }, (_, index) =>
    buildEnglishItemFromEnrichment({
      ...englishDraft,
      data: {
        ...englishDraft.data,
        normalizedWord: `word${index}`,
        meaningsZh: [`词${index}`]
      },
      originalQuery: `word${index}`
    }, `word${index}`, "2026-07-18")
  );

  const queue = buildTodayQueue(items, "2026-07-18");

  assert.equal(queue.length, 1000);
  assert.equal(queue.every((card) => card.cardType === "english"), true);
});
