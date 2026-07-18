import { addReviewEvent, getItem, updateItem } from "./db.js";
import { toLocalDate } from "./date-utils.js";
import { filterQueueByMode, scheduleSameDayRetry } from "./queue-builder.js";
import { applyCharacterFeedback, applyChineseFeedback, applyEnglishFeedback } from "./review-engine.js";
import { CHINESE_FEEDBACK, ENGLISH_DIMENSIONS, ITEM_TYPES, REVIEW_RESULTS } from "./review-types.js";

export const SESSION_KEY = "dictation-review-current-session";
const PUNCTUATION_PATTERN = /^[\s，。！？；：、,.!?;:"'（）()[\]《》<>—-]$/u;

export function isClickableCharacter(char) {
  return Boolean(char && !PUNCTUATION_PATTERN.test(char));
}

export function tokenizeText(text) {
  return Array.from(String(text || "")).map((char, index) => ({
    char,
    index,
    clickable: isClickableCharacter(char)
  }));
}

export function createEmptySummary() {
  return {
    formalCount: 0,
    correctCount: 0,
    wrongCount: 0,
    spellingWrongCount: 0,
    phoneticWrongCount: 0,
    chineseWrongCharCount: 0,
    poemWrongCharCount: 0,
    retryCorrectCount: 0,
    retryWrongCount: 0,
    tomorrowCount: 0
  };
}

export function createDictationSession(queue, items, { today = toLocalDate(), mode = "all" } = {}) {
  const filtered = filterQueueByMode(queue, mode).map((card) => attachItemSnapshot(card, items));
  return {
    id: crypto.randomUUID(),
    date: today,
    mode,
    queue: filtered,
    currentCard: null,
    completed: [],
    stats: createEmptySummary(),
    exhaustedRetryCount: 0,
    dailyTargetCount: queue.length,
    rewardRecorded: false,
    status: filtered.length ? "in_progress" : "completed",
    createdAt: new Date().toISOString()
  };
}

function attachItemSnapshot(card, items) {
  const item = items.find((entry) => entry.id === card.itemId);
  return {
    ...card,
    itemSnapshot: structuredClone(item)
  };
}

export function takeNextCard(session) {
  if (session.currentCard) return session;
  const [nextCard, ...rest] = session.queue;
  return {
    ...session,
    currentCard: nextCard || null,
    queue: rest,
    status: nextCard ? "in_progress" : "completed"
  };
}

export function getCardView(card) {
  if (!card?.itemSnapshot) return null;
  const item = card.itemSnapshot;

  if (card.cardType === "english") {
    const meanings = item.payload?.meaningsZh || [];
    const parts = item.payload?.partsOfSpeech || [];
    const testsSpelling = card.dimensions.includes(ENGLISH_DIMENSIONS.spelling);
    const testsPhonetic = card.dimensions.includes(ENGLISH_DIMENSIONS.phonetic);
    return {
      title: testsSpelling && testsPhonetic ? "英语：拼写 + 音标" : testsSpelling ? "英语：拼写" : "英语：音标",
      promptLines: testsPhonetic && !testsSpelling
        ? [`英文单词：${item.text}`]
        : [`中文释义：${meanings.join("；") || "未填写"}`, `词性：${parts.join(", ") || "未填写"}`],
      answerLines: [
        `英文拼写：${item.text}`,
        `英式音标：${item.payload?.ukPhonetic || ""}`,
        `美式音标：${item.payload?.usPhonetic || ""}`
      ],
      feedbackMode: testsSpelling && testsPhonetic ? "english_both" : testsSpelling ? "english_spelling" : "english_phonetic"
    };
  }

  if (card.cardType === "character") {
    const track = card.characterTrack || item.characterTracks?.[card.character] || {};
    const relatedWords = Array.isArray(track.relatedWords) ? track.relatedWords.slice(0, 2) : [];
    const carriers = [
      { type: "original", text: item.text, detail: "原词句" },
      ...relatedWords.map((word) => ({
        type: "related",
        text: word.word,
        detail: [word.pinyin, word.definition].filter(Boolean).join("；")
      }))
    ];
    const rotationIndex = carriers.length ? (track.currentRotationIndex || 0) % carriers.length : 0;
    const carrier = carriers[rotationIndex] || carriers[0];
    return {
      title: `错字强化：${card.character}`,
      promptLines: [`载体：${carrier.text}`],
      answerLines: [
        `家长检查目标字：${card.character}`,
        `载体：${carrier.text}`,
        carrier.detail ? `说明：${carrier.detail}` : ""
      ].filter(Boolean),
      feedbackMode: "character",
      characterCarrier: carrier
    };
  }

  return {
    title: item.type === ITEM_TYPES.poemLine ? `古诗句：${item.title || item.payload?.title || ""}` : "中文词语",
    promptLines: ["请家长读题，学生纸笔听写。"],
    answerLines: [`正确答案：${item.text}`],
    feedbackMode: "whole_item",
    tokens: tokenizeText(item.text)
  };
}

function normalizeOutcome(card, feedback) {
  if (card.cardType === "english") {
    const spellingWrong = feedback.kind === "spelling_wrong" || feedback.kind === "both_wrong" || (feedback.kind === "wrong" && card.dimensions.includes(ENGLISH_DIMENSIONS.spelling));
    const phoneticWrong = feedback.kind === "phonetic_wrong" || feedback.kind === "both_wrong" || (feedback.kind === "wrong" && card.dimensions.includes(ENGLISH_DIMENSIONS.phonetic));
    return {
      anyWrong: spellingWrong || phoneticWrong,
      spellingWrong,
      phoneticWrong,
      wrongCharacters: []
    };
  }

  if (card.cardType === "character") {
    return {
      anyWrong: feedback.kind === "wrong",
      spellingWrong: false,
      phoneticWrong: false,
      wrongCharacters: []
    };
  }

  const wrongCharacters = feedback.kind === "partial_wrong" ? feedback.wrongCharacters || [] : [];
  return {
    anyWrong: feedback.kind === "partial_wrong" || feedback.kind === "entire_unknown",
    spellingWrong: false,
    phoneticWrong: false,
    wrongCharacters,
    relatedWordsByCharacter: feedback.relatedWordsByCharacter || {}
  };
}

function incrementSummary(summary, card, outcome) {
  const next = { ...summary };
  if (card.isRetry) {
    if (outcome.anyWrong) next.retryWrongCount += 1;
    else next.retryCorrectCount += 1;
  } else {
    next.formalCount += 1;
    if (outcome.anyWrong) next.wrongCount += 1;
    else next.correctCount += 1;
  }

  if (outcome.spellingWrong) next.spellingWrongCount += 1;
  if (outcome.phoneticWrong) next.phoneticWrongCount += 1;
  if (card.itemType === ITEM_TYPES.chinesePhrase) next.chineseWrongCharCount += outcome.wrongCharacters.length;
  if (card.itemType === ITEM_TYPES.poemLine) next.poemWrongCharCount += outcome.wrongCharacters.length;
  return next;
}

function applyOutcomeToItem(item, card, outcome, today) {
  let nextItem;
  if (card.cardType === "english") {
    const spellingResult = card.dimensions.includes(ENGLISH_DIMENSIONS.spelling)
      ? outcome.spellingWrong ? REVIEW_RESULTS.wrong : REVIEW_RESULTS.correct
      : null;
    const phoneticResult = card.dimensions.includes(ENGLISH_DIMENSIONS.phonetic)
      ? outcome.phoneticWrong ? REVIEW_RESULTS.wrong : REVIEW_RESULTS.correct
      : null;
    nextItem = applyEnglishFeedback(item, {
      today,
      spellingResult,
      phoneticResult,
      isSameDayRetry: card.isRetry
    }).item;
    return withNextReviewDate(nextItem);
  }

  if (card.cardType === "character") {
    nextItem = applyCharacterFeedback(item, {
      today,
      character: card.character,
      result: outcome.anyWrong ? REVIEW_RESULTS.wrong : REVIEW_RESULTS.correct,
      isSameDayRetry: card.isRetry
    }).item;
    return withNextReviewDate(nextItem);
  }

  const feedback = outcome.anyWrong
    ? outcome.wrongCharacters.length ? CHINESE_FEEDBACK.partialCharacterWrong : CHINESE_FEEDBACK.entireUnknown
    : CHINESE_FEEDBACK.correct;
  nextItem = applyChineseFeedback(item, {
    today,
    feedback,
    wrongCharacters: outcome.wrongCharacters,
    relatedWordsByCharacter: outcome.relatedWordsByCharacter,
    isSameDayRetry: card.isRetry
  }).item;
  return withNextReviewDate(nextItem);
}

function withNextReviewDate(item) {
  const dates = [];
  if (item.spellingTrack?.nextReviewDate) dates.push(item.spellingTrack.nextReviewDate);
  if (item.phoneticTrack?.nextReviewDate) dates.push(item.phoneticTrack.nextReviewDate);
  if (item.wholeItemTrack?.nextReviewDate) dates.push(item.wholeItemTrack.nextReviewDate);
  for (const track of Object.values(item.characterTracks || {})) {
    if (track.active !== false && track.nextReviewDate) dates.push(track.nextReviewDate);
  }
  return dates.length ? { ...item, nextReviewDate: dates.sort()[0] } : item;
}

function buildReviewEvent(session, card, outcome, feedback) {
  return {
    itemId: card.itemId,
    reviewUnit: card.cardType,
    date: session.date,
    result: outcome.anyWrong ? "incorrect" : "correct",
    wrongCharacters: outcome.wrongCharacters,
    isSameDayRetry: Boolean(card.isRetry),
    studentAnswer: feedback.studentAnswer || "",
    dimensions: card.dimensions,
    createdAt: new Date().toISOString()
  };
}

export async function recordCardResult(session, feedback) {
  if (!session.currentCard) throw new Error("没有正在听写的卡片。");

  const card = session.currentCard;
  const item = await getItem(card.itemId);
  if (!item) throw new Error("学习内容不存在，已安全结束本张卡。");

  const outcome = normalizeOutcome(card, feedback);
  const updatedItem = applyOutcomeToItem(item, card, outcome, session.date);
  await updateItem(item.id, updatedItem);
  await addReviewEvent(buildReviewEvent(session, card, outcome, feedback));

  let nextQueue = [...session.queue];
  let tomorrowCount = session.stats.tomorrowCount || 0;
  let exhaustedRetryCount = session.exhaustedRetryCount || 0;

  if (outcome.anyWrong) {
    const retry = scheduleSameDayRetry(nextQueue, card);
    nextQueue = retry.queue;
    if (!retry.scheduled) {
      tomorrowCount += 1;
      exhaustedRetryCount += 1;
    }
  }

  return {
    ...session,
    currentCard: null,
    queue: nextQueue,
    completed: [...session.completed, { card, outcome, feedback }],
    stats: {
      ...incrementSummary(session.stats, card, outcome),
      tomorrowCount
    },
    exhaustedRetryCount,
    status: nextQueue.length ? "in_progress" : "completed"
  };
}

export function saveSessionToStorage(session, storage = localStorage) {
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSessionFromStorage(storage = localStorage) {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session || session.status === "completed") {
      storage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    storage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearSessionStorage(storage = localStorage) {
  storage.removeItem(SESSION_KEY);
}
