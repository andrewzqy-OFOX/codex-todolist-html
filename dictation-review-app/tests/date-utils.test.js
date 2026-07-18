import test from "node:test";
import assert from "node:assert/strict";

import { addDays, assertLocalDate, compareLocalDates, isValidLocalDate } from "../public/js/date-utils.js";

test("validates local YYYY-MM-DD dates", () => {
  assert.equal(isValidLocalDate("2026-07-18"), true);
  assert.equal(isValidLocalDate("2026-02-29"), false);
  assert.equal(isValidLocalDate("2024-02-29"), true);
  assert.equal(isValidLocalDate("2026-7-18"), false);
  assert.throws(() => assertLocalDate("2026-13-01"), /YYYY-MM-DD/);
});

test("compares local dates lexically after validation", () => {
  assert.equal(compareLocalDates("2026-07-18", "2026-07-18"), 0);
  assert.equal(compareLocalDates("2026-07-17", "2026-07-18") < 0, true);
  assert.equal(compareLocalDates("2026-07-19", "2026-07-18") > 0, true);
});

test("adds days across month and year boundaries", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
});
