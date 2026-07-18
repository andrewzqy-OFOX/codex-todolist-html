import { addDays, assertLocalDate } from "./date-utils.js";
import {
  CHARACTER_REVIEW_INTERVALS,
  CHINESE_FEEDBACK,
  ENGLISH_DIMENSIONS,
  REVIEW_RESULTS,
  STANDARD_REVIEW_INTERVALS,
  TRACK_STATUSES,
  createCharacterTrack,
  createReviewTrack
} from "./review-types.js";

function clone(value) {
  return structuredClone(value);
}

function intervalForStage(intervals, stage) {
  const index = Math.max(0, Math.min(stage - 1, intervals.length - 1));
  return intervals[index];
}

function normalizeWrongCharacter(entry) {
  if (typeof entry === "string") return entry;
  return entry?.char || "";
}

function mergeRelatedWords(existingWords = [], confirmedWords = []) {
  const seen = new Set();
  const merged = [];

  for (const word of [...existingWords, ...confirmedWords]) {
    const text = String(word?.word || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    merged.push({
      word: text,
      pinyin: String(word?.pinyin || "").trim(),
      definition: String(word?.definition || "").trim(),
      recommendationReason: String(word?.recommendationReason || word?.reason || "").trim(),
      sources: Array.isArray(word?.sources) ? word.sources : [],
      confidence: word?.confidence || "low",
      confirmed: true,
      manual: Boolean(word?.manual)
    });
    if (merged.length >= 2) break;
  }

  return merged;
}

function advanceRotation(track) {
  const carrierCount = 1 + Math.min((track.relatedWords || []).length, 2);
  return carrierCount > 1
    ? (track.currentRotationIndex || 0) + 1 >= carrierCount
      ? 0
      : (track.currentRotationIndex || 0) + 1
    : 0;
}

export function createEnglishItem({ id, text, today, spellingTrack, phoneticTrack, createdDate = today }) {
  assertLocalDate(today, "today");
  return {
    id,
    type: "english_word",
    text,
    status: "active",
    createdDate,
    spellingTrack: spellingTrack || createReviewTrack(today),
    phoneticTrack: phoneticTrack || createReviewTrack(today)
  };
}

export function createChineseItem({ id, text, today, type = "chinese_phrase", wholeItemTrack, characterTracks = {}, createdDate = today }) {
  assertLocalDate(today, "today");
  return {
    id,
    type,
    text,
    status: "active",
    createdDate,
    wholeItemTrack: wholeItemTrack || createReviewTrack(today),
    characterTracks: clone(characterTracks)
  };
}

export function isTrackDue(track, today) {
  assertLocalDate(today, "today");
  return Boolean(track?.nextReviewDate && track.nextReviewDate <= today && track.status !== "archived");
}

export function applyTrackReview(track, { today, result, isSameDayRetry = false, intervals = STANDARD_REVIEW_INTERVALS, masteredStage = intervals.length }) {
  assertLocalDate(today, "today");
  const next = clone(track);

  if (isSameDayRetry) {
    return next;
  }

  if (result === REVIEW_RESULTS.correct && next.lastReviewedDate === today) {
    return next;
  }

  next.lastReviewedDate = today;

  if (result === REVIEW_RESULTS.correct) {
    const nextStage = next.status === TRACK_STATUSES.mastered ? masteredStage : Math.min((next.stage || 0) + 1, masteredStage);
    next.stage = nextStage;
    next.correctStreak = (next.correctStreak || 0) + 1;
    next.totalCorrect = (next.totalCorrect || 0) + 1;
    next.nextReviewDate = addDays(today, intervalForStage(intervals, nextStage));
    next.status = nextStage >= masteredStage ? TRACK_STATUSES.mastered : TRACK_STATUSES.learning;
    return next;
  }

  if (result === REVIEW_RESULTS.wrong) {
    next.stage = 0;
    next.correctStreak = 0;
    next.totalWrong = (next.totalWrong || 0) + 1;
    next.nextReviewDate = addDays(today, 1);
    next.status = TRACK_STATUSES.learning;
    return next;
  }

  throw new Error(`Unknown review result: ${result}`);
}

export function applyCharacterTrackReview(track, { today, result, isSameDayRetry = false }) {
  const reviewed = applyTrackReview(track, {
    today,
    result,
    isSameDayRetry,
    intervals: CHARACTER_REVIEW_INTERVALS,
    masteredStage: CHARACTER_REVIEW_INTERVALS.length
  });

  if (isSameDayRetry) {
    return reviewed;
  }

  const rotated = {
    ...reviewed,
    currentRotationIndex: advanceRotation(reviewed)
  };

  if (result === REVIEW_RESULTS.correct && rotated.stage >= CHARACTER_REVIEW_INTERVALS.length) {
    return {
      ...rotated,
      active: false,
      status: TRACK_STATUSES.mastered
    };
  }

  if (result === REVIEW_RESULTS.wrong) {
    return {
      ...rotated,
      active: true,
      status: TRACK_STATUSES.learning
    };
  }

  return {
    ...rotated,
    active: true
  };
}

export function applyEnglishFeedback(item, { today, spellingResult, phoneticResult, isSameDayRetry = false }) {
  const next = clone(item);
  const retryDimensions = [];

  if (spellingResult) {
    next.spellingTrack = applyTrackReview(item.spellingTrack, {
      today,
      result: spellingResult,
      isSameDayRetry
    });
    if (spellingResult === REVIEW_RESULTS.wrong) retryDimensions.push(ENGLISH_DIMENSIONS.spelling);
  }

  if (phoneticResult) {
    next.phoneticTrack = applyTrackReview(item.phoneticTrack, {
      today,
      result: phoneticResult,
      isSameDayRetry
    });
    if (phoneticResult === REVIEW_RESULTS.wrong) retryDimensions.push(ENGLISH_DIMENSIONS.phonetic);
  }

  return {
    item: next,
    retryNeeded: retryDimensions.length > 0,
    retryDimensions
  };
}

export function applyChineseFeedback(item, { today, feedback, wrongCharacters = [], relatedWordsByCharacter = {}, isSameDayRetry = false }) {
  const next = clone(item);
  const uniqueCharacters = [...new Set(wrongCharacters.map(normalizeWrongCharacter).filter(Boolean))];
  const retryCharacters = [];

  if (feedback === CHINESE_FEEDBACK.correct) {
    next.wholeItemTrack = applyTrackReview(item.wholeItemTrack, {
      today,
      result: REVIEW_RESULTS.correct,
      isSameDayRetry
    });
    return { item: next, retryNeeded: false, retryCharacters };
  }

  if (feedback === CHINESE_FEEDBACK.partialCharacterWrong || feedback === CHINESE_FEEDBACK.entireUnknown) {
    next.wholeItemTrack = applyTrackReview(item.wholeItemTrack, {
      today,
      result: REVIEW_RESULTS.wrong,
      isSameDayRetry
    });

    if (feedback === CHINESE_FEEDBACK.partialCharacterWrong) {
      for (const character of uniqueCharacters) {
        const existing = next.characterTracks[character] || createCharacterTrack(character, today, {
          originalItemId: item.id
        });
        const confirmedRelatedWords = relatedWordsByCharacter[character] || [];
        const prepared = {
          ...existing,
          character,
          originalItemId: existing.originalItemId || item.id,
          wrongCount: (existing.wrongCount || 0) + (isSameDayRetry ? 0 : 1),
          relatedWords: mergeRelatedWords(existing.relatedWords, confirmedRelatedWords)
        };
        next.characterTracks[character] = applyCharacterTrackReview(prepared, {
          today,
          result: REVIEW_RESULTS.wrong,
          isSameDayRetry
        });
        retryCharacters.push(character);
      }
    }

    return {
      item: next,
      retryNeeded: true,
      retryCharacters
    };
  }

  throw new Error(`Unknown Chinese feedback: ${feedback}`);
}

export function applyCharacterFeedback(item, { today, character, result, isSameDayRetry = false }) {
  if (!character) {
    throw new Error("character is required.");
  }

  const next = clone(item);
  const existing = next.characterTracks[character] || createCharacterTrack(character, today, {
    originalItemId: item.id
  });
  next.characterTracks[character] = applyCharacterTrackReview({
    ...existing,
    originalItemId: existing.originalItemId || item.id
  }, {
    today,
    result,
    isSameDayRetry
  });

  return {
    item: next,
    retryNeeded: result === REVIEW_RESULTS.wrong
  };
}
