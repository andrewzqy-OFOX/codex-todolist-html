export const ITEM_TYPES = Object.freeze({
  englishWord: "english_word",
  chinesePhrase: "chinese_phrase",
  poemLine: "poem_line"
});

export const TRACK_STATUSES = Object.freeze({
  learning: "learning",
  mastered: "mastered"
});

export const REVIEW_RESULTS = Object.freeze({
  correct: "correct",
  wrong: "wrong"
});

export const ENGLISH_DIMENSIONS = Object.freeze({
  spelling: "spelling",
  phonetic: "phonetic"
});

export const CHINESE_FEEDBACK = Object.freeze({
  correct: "correct",
  partialCharacterWrong: "partial_character_wrong",
  entireUnknown: "entire_unknown"
});

export const STANDARD_REVIEW_INTERVALS = Object.freeze([1, 3, 7, 15, 30, 60]);
export const CHARACTER_REVIEW_INTERVALS = Object.freeze([3, 7, 7]);
export const RETRY_GAP_CARDS = 3;
export const DEFAULT_MAX_RETRIES_PER_CARD = 3;

export function createReviewTrack(today, overrides = {}) {
  return {
    stage: 0,
    correctStreak: 0,
    totalCorrect: 0,
    totalWrong: 0,
    nextReviewDate: today,
    status: TRACK_STATUSES.learning,
    lastReviewedDate: null,
    ...overrides
  };
}

export function createCharacterTrack(character, today, overrides = {}) {
  return {
    character,
    originalItemId: null,
    wrongCount: 0,
    active: true,
    stage: 0,
    correctStreak: 0,
    totalCorrect: 0,
    totalWrong: 0,
    nextReviewDate: today,
    status: TRACK_STATUSES.learning,
    relatedWords: [],
    currentRotationIndex: 0,
    lastReviewedDate: null,
    ...overrides
  };
}
