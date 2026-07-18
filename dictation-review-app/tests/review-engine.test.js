import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCharacterFeedback,
  applyChineseFeedback,
  applyEnglishFeedback,
  applyTrackReview,
  createChineseItem,
  createEnglishItem
} from "../public/js/review-engine.js";
import { CHINESE_FEEDBACK, REVIEW_RESULTS, TRACK_STATUSES, createReviewTrack } from "../public/js/review-types.js";

test("correct formal reviews schedule 1, 3, 7, 15, 30, and 60 days", () => {
  let track = createReviewTrack("2026-07-18");
  const reviewDates = ["2026-07-18", "2026-07-19", "2026-07-22", "2026-07-29", "2026-08-13", "2026-09-12"];
  const expected = [
    ["2026-07-19", TRACK_STATUSES.learning],
    ["2026-07-22", TRACK_STATUSES.learning],
    ["2026-07-29", TRACK_STATUSES.learning],
    ["2026-08-13", TRACK_STATUSES.learning],
    ["2026-09-12", TRACK_STATUSES.learning],
    ["2026-11-11", TRACK_STATUSES.mastered]
  ];

  for (let i = 0; i < expected.length; i += 1) {
    track = applyTrackReview(track, {
      today: reviewDates[i],
      result: REVIEW_RESULTS.correct
    });
    assert.equal(track.stage, i + 1);
    assert.equal(track.nextReviewDate, expected[i][0]);
    assert.equal(track.status, expected[i][1]);
  }
});

test("formal correct on the same date does not advance long-term stage twice", () => {
  const track = createReviewTrack("2026-07-18");
  const first = applyTrackReview(track, {
    today: "2026-07-18",
    result: REVIEW_RESULTS.correct
  });
  const second = applyTrackReview(first, {
    today: "2026-07-18",
    result: REVIEW_RESULTS.correct
  });

  assert.equal(second.stage, 1);
  assert.equal(second.totalCorrect, 1);
  assert.equal(second.nextReviewDate, "2026-07-19");
});

test("wrong formal review schedules tomorrow and resets mastered content to learning", () => {
  const mastered = createReviewTrack("2026-07-18", {
    stage: 6,
    correctStreak: 6,
    totalCorrect: 6,
    status: TRACK_STATUSES.mastered,
    nextReviewDate: "2026-07-18"
  });

  const next = applyTrackReview(mastered, {
    today: "2026-07-18",
    result: REVIEW_RESULTS.wrong
  });

  assert.equal(next.stage, 0);
  assert.equal(next.correctStreak, 0);
  assert.equal(next.totalWrong, 1);
  assert.equal(next.status, TRACK_STATUSES.learning);
  assert.equal(next.nextReviewDate, "2026-07-19");
});

test("same-day retry is recorded outside the long-term track and does not upgrade", () => {
  const track = createReviewTrack("2026-07-18", {
    stage: 1,
    correctStreak: 1,
    totalCorrect: 1,
    nextReviewDate: "2026-07-19"
  });

  const next = applyTrackReview(track, {
    today: "2026-07-18",
    result: REVIEW_RESULTS.correct,
    isSameDayRetry: true
  });

  assert.deepEqual(next, track);
});

test("English spelling and phonetic tracks update independently", () => {
  const item = createEnglishItem({ id: "word-1", text: "example", today: "2026-07-18" });

  const { item: next } = applyEnglishFeedback(item, {
    today: "2026-07-18",
    spellingResult: REVIEW_RESULTS.wrong
  });

  assert.equal(next.spellingTrack.totalWrong, 1);
  assert.equal(next.spellingTrack.nextReviewDate, "2026-07-19");
  assert.deepEqual(next.phoneticTrack, item.phoneticTrack);
});

test("English feedback can update both due dimensions in one card", () => {
  const item = createEnglishItem({ id: "word-1", text: "example", today: "2026-07-18" });

  const { item: next, retryDimensions } = applyEnglishFeedback(item, {
    today: "2026-07-18",
    spellingResult: REVIEW_RESULTS.correct,
    phoneticResult: REVIEW_RESULTS.wrong
  });

  assert.equal(next.spellingTrack.stage, 1);
  assert.equal(next.phoneticTrack.stage, 0);
  assert.deepEqual(retryDimensions, ["phonetic"]);
});

test("partial Chinese character errors update whole item and selected characters only", () => {
  const item = createChineseItem({ id: "phrase-1", text: "坚持", today: "2026-07-18" });

  const { item: next, retryCharacters } = applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: ["持"]
  });

  assert.equal(next.wholeItemTrack.totalWrong, 1);
  assert.equal(next.wholeItemTrack.nextReviewDate, "2026-07-19");
  assert.ok(next.characterTracks["持"]);
  assert.equal(next.characterTracks["持"].active, true);
  assert.equal(next.characterTracks["持"].nextReviewDate, "2026-07-19");
  assert.equal(next.characterTracks["坚"], undefined);
  assert.deepEqual(retryCharacters, ["持"]);
});

test("entire unknown Chinese item does not guess character tracks", () => {
  const item = createChineseItem({ id: "phrase-1", text: "坚持", today: "2026-07-18" });

  const { item: next, retryCharacters } = applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.entireUnknown,
    wrongCharacters: ["坚", "持"]
  });

  assert.equal(next.wholeItemTrack.totalWrong, 1);
  assert.deepEqual(next.characterTracks, {});
  assert.deepEqual(retryCharacters, []);
});

test("character reinforcement exits after three correct formal reviews across dates", () => {
  let item = createChineseItem({ id: "phrase-1", text: "坚持", today: "2026-07-18" });
  item = applyChineseFeedback(item, {
    today: "2026-07-18",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: ["持"]
  }).item;

  item = applyCharacterFeedback(item, {
    today: "2026-07-19",
    character: "持",
    result: REVIEW_RESULTS.correct
  }).item;
  assert.equal(item.characterTracks["持"].nextReviewDate, "2026-07-22");
  assert.equal(item.characterTracks["持"].active, true);

  item = applyCharacterFeedback(item, {
    today: "2026-07-22",
    character: "持",
    result: REVIEW_RESULTS.correct
  }).item;
  assert.equal(item.characterTracks["持"].nextReviewDate, "2026-07-29");

  item = applyCharacterFeedback(item, {
    today: "2026-07-29",
    character: "持",
    result: REVIEW_RESULTS.correct
  }).item;

  assert.equal(item.characterTracks["持"].stage, 3);
  assert.equal(item.characterTracks["持"].status, TRACK_STATUSES.mastered);
  assert.equal(item.characterTracks["持"].active, false);
});

test("mastered character track can be reactivated after a new error", () => {
  const item = createChineseItem({
    id: "phrase-1",
    text: "坚持",
    today: "2026-07-18",
    characterTracks: {
      持: {
        character: "持",
        active: false,
        stage: 3,
        correctStreak: 3,
        totalCorrect: 3,
        totalWrong: 0,
        nextReviewDate: "2026-07-23",
        status: TRACK_STATUSES.mastered,
        lastReviewedDate: "2026-07-23"
      }
    }
  });

  const { item: next } = applyChineseFeedback(item, {
    today: "2026-08-01",
    feedback: CHINESE_FEEDBACK.partialCharacterWrong,
    wrongCharacters: ["持"]
  });

  assert.equal(next.characterTracks["持"].active, true);
  assert.equal(next.characterTracks["持"].status, TRACK_STATUSES.learning);
  assert.equal(next.characterTracks["持"].stage, 0);
  assert.equal(next.characterTracks["持"].nextReviewDate, "2026-08-02");
});
