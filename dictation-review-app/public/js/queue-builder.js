import { assertLocalDate } from "./date-utils.js";
import {
  DEFAULT_MAX_RETRIES_PER_CARD,
  ENGLISH_DIMENSIONS,
  ITEM_TYPES,
  RETRY_GAP_CARDS
} from "./review-types.js";
import { isTrackDue } from "./review-engine.js";

export const DAILY_CATEGORY_LIMITS = Object.freeze({
  english: 40,
  chinese: 40,
  poem: 10
});

function isActiveItem(item) {
  return item.status !== "archived";
}

function makeBaseCard(item, extra) {
  return {
    id: extra.id,
    itemId: item.id,
    itemType: item.type,
    text: item.text,
    createdDate: item.createdDate,
    isNewToday: false,
    isRetry: false,
    retryCount: 0,
    ...extra
  };
}

export function buildTodayQueue(items, today) {
  assertLocalDate(today, "today");
  const cards = [];

  for (const item of items.filter(isActiveItem)) {
    const isNewToday = item.createdDate === today;

    if (item.type === ITEM_TYPES.englishWord) {
      const dueDimensions = [];
      if (isTrackDue(item.spellingTrack, today)) dueDimensions.push(ENGLISH_DIMENSIONS.spelling);
      if (isTrackDue(item.phoneticTrack, today)) dueDimensions.push(ENGLISH_DIMENSIONS.phonetic);

      if (dueDimensions.length || isNewToday) {
        cards.push(makeBaseCard(item, {
          id: `english:${item.id}:${dueDimensions.join("+") || "new"}`,
          cardType: "english",
          dimensions: dueDimensions.length ? dueDimensions : [ENGLISH_DIMENSIONS.spelling, ENGLISH_DIMENSIONS.phonetic],
          isNewToday
        }));
      }
      continue;
    }

    if (item.type === ITEM_TYPES.chinesePhrase || item.type === ITEM_TYPES.poemLine) {
      if (isTrackDue(item.wholeItemTrack, today) || isNewToday) {
        cards.push(makeBaseCard(item, {
          id: `whole:${item.id}`,
          cardType: "whole_item",
          dimensions: ["whole_item"],
          isNewToday
        }));
      }

      const characterEntries = Object.entries(item.characterTracks || {}).filter(([, track]) => track.active !== false && isTrackDue(track, today));
      for (const [character, track] of characterEntries) {
        cards.push(makeBaseCard(item, {
          id: `character:${item.id}:${character}`,
          cardType: "character",
          dimensions: ["character"],
          character,
          characterTrack: track
        }));
      }
    }
  }

  return applyDailyCategoryLimits(avoidConsecutiveSameCharacter(cards));
}

function categoryKeyForCard(card) {
  if (card.itemType === ITEM_TYPES.englishWord) return "english";
  if (card.itemType === ITEM_TYPES.chinesePhrase) return "chinese";
  if (card.itemType === ITEM_TYPES.poemLine) return "poem";
  return "other";
}

export function applyDailyCategoryLimits(cards, limits = DAILY_CATEGORY_LIMITS) {
  const counts = {
    english: 0,
    chinese: 0,
    poem: 0
  };

  return cards.filter((card) => {
    const key = categoryKeyForCard(card);
    const limit = limits[key];
    if (!limit) return true;
    if (counts[key] >= limit) return false;
    counts[key] += 1;
    return true;
  });
}

export function buildTodayStats(items, today) {
  const queue = buildTodayQueue(items, today);
  const stats = {
    newCount: 0,
    regularReviewCount: 0,
    characterReviewCount: 0,
    englishCount: 0,
    chineseCount: 0,
    poemCount: 0,
    overdueCount: 0,
    totalCount: queue.length
  };

  for (const card of queue) {
    if (card.isNewToday) stats.newCount += 1;
    if (card.itemType === ITEM_TYPES.englishWord) stats.englishCount += 1;
    if (card.itemType === ITEM_TYPES.chinesePhrase) stats.chineseCount += 1;
    if (card.itemType === ITEM_TYPES.poemLine) stats.poemCount += 1;

    if (card.cardType === "character") {
      stats.characterReviewCount += 1;
      if (card.characterTrack?.nextReviewDate < today) stats.overdueCount += 1;
      continue;
    }

    if (!card.isNewToday) stats.regularReviewCount += 1;
    const item = items.find((entry) => entry.id === card.itemId);
    if (item?.type === ITEM_TYPES.englishWord) {
      const dates = [];
      if (card.dimensions.includes(ENGLISH_DIMENSIONS.spelling)) dates.push(item.spellingTrack?.nextReviewDate);
      if (card.dimensions.includes(ENGLISH_DIMENSIONS.phonetic)) dates.push(item.phoneticTrack?.nextReviewDate);
      if (dates.some((date) => date && date < today)) stats.overdueCount += 1;
    } else if (item?.wholeItemTrack?.nextReviewDate < today) {
      stats.overdueCount += 1;
    }
  }

  return stats;
}

export function filterQueueByMode(queue, mode = "all") {
  if (mode === "all") return [...queue];
  if (mode === "english") return queue.filter((card) => card.itemType === ITEM_TYPES.englishWord);
  if (mode === "chinese") return queue.filter((card) => card.itemType === ITEM_TYPES.chinesePhrase);
  if (mode === "poem") return queue.filter((card) => card.itemType === ITEM_TYPES.poemLine);
  if (mode === "character") return queue.filter((card) => card.cardType === "character");
  return [];
}

export function avoidConsecutiveSameCharacter(cards) {
  const result = [];
  const remaining = [...cards];

  while (remaining.length) {
    const previous = result[result.length - 1];
    let index = 0;

    if (previous?.cardType === "character") {
      const differentIndex = remaining.findIndex((card) => card.cardType !== "character" || card.character !== previous.character);
      if (differentIndex >= 0) index = differentIndex;
    }

    result.push(remaining.splice(index, 1)[0]);
  }

  return result;
}

export function scheduleSameDayRetry(queue, failedCard, options = {}) {
  const gapCards = options.gapCards ?? RETRY_GAP_CARDS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES_PER_CARD;
  const currentRetryCount = failedCard.retryCount || 0;

  if (currentRetryCount >= maxRetries) {
    return {
      queue: [...queue],
      scheduled: false,
      message: "明天继续复习"
    };
  }

  const retryCard = {
    ...failedCard,
    id: `${failedCard.id}:retry:${currentRetryCount + 1}`,
    isRetry: true,
    retryCount: currentRetryCount + 1
  };
  const nextQueue = [...queue];
  const insertAt = Math.min(gapCards, nextQueue.length);
  nextQueue.splice(insertAt, 0, retryCard);

  return {
    queue: nextQueue,
    scheduled: true,
    message: null
  };
}
