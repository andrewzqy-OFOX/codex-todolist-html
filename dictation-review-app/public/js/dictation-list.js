import { ENGLISH_DIMENSIONS } from "./review-types.js";

function trackList(item) {
  const tracks = [];
  if (item?.spellingTrack) tracks.push(item.spellingTrack);
  if (item?.phoneticTrack) tracks.push(item.phoneticTrack);
  if (item?.wholeItemTrack) tracks.push(item.wholeItemTrack);
  for (const track of Object.values(item?.characterTracks || {})) tracks.push(track);
  return tracks;
}

export function summarizeItemAccuracy(item) {
  const totals = trackList(item).reduce((sum, track) => ({
    correct: sum.correct + (track.totalCorrect || 0),
    wrong: sum.wrong + (track.totalWrong || 0)
  }), { correct: 0, wrong: 0 });
  return {
    correct: totals.correct,
    total: totals.correct + totals.wrong
  };
}

export function formatAccuracyRatio(item) {
  const accuracy = summarizeItemAccuracy(item);
  return `${accuracy.correct}/${accuracy.total}`;
}

export function quickFeedbackForCard(card, isCorrect) {
  if (isCorrect) return { kind: "correct" };

  if (card.cardType === "english") {
    const testsSpelling = card.dimensions.includes(ENGLISH_DIMENSIONS.spelling);
    const testsPhonetic = card.dimensions.includes(ENGLISH_DIMENSIONS.phonetic);
    if (testsSpelling && testsPhonetic) return { kind: "both_wrong" };
    return { kind: "wrong" };
  }

  if (card.cardType === "whole_item") return { kind: "entire_unknown" };
  return { kind: "wrong" };
}

export function dictationListLabel(card) {
  const item = card.itemSnapshot || {};
  if (card.cardType === "character") {
    const character = card.character || "";
    return `${item.text || card.text || ""}（目标字：${character}）`;
  }
  return item.text || card.text || "";
}
