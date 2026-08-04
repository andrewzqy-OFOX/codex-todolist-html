import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const todoListHtml = await readFile(new URL("../../todo-list.html", import.meta.url), "utf8");

test("todo-list keeps deleted tasks archived instead of removing them", () => {
  assert.match(todoListHtml, /task\.archivedAt = selectedDate/);
  assert.match(todoListHtml, /function confirmedDayStats\(dateKey\)/);
  assert.match(todoListHtml, /const archivedTasks = data\.tasks\.filter/);
  assert.doesNotMatch(todoListHtml, /data\.tasks = data\.tasks\.filter\(\(todo\) => todo\.id !== item\.dataset\.id\)/);
});

test("todo-list does not recreate missing default tasks on every refresh", () => {
  assert.doesNotMatch(todoListHtml, /ensureDefaultDailyTasks\(nextData/);
  assert.match(todoListHtml, /nextData\.tasks = Array\.isArray\(nextData\.tasks\)/);
});

test("todo-list weekly tasks store a weekly target and daily logs", () => {
  assert.match(todoListHtml, /data-type="weekly"/);
  assert.match(todoListHtml, /id="weeklyTaskList"/);
  assert.match(todoListHtml, /id="weeklySummary"/);
  assert.match(todoListHtml, /<h2>本周任务<\/h2>/);
  assert.match(todoListHtml, /<section class="panel list-panel"[\s\S]*<section class="panel weekly-panel"/);
  assert.match(todoListHtml, /weeklyTargetMinutes/);
  assert.match(todoListHtml, /weeklyTargetCount/);
  assert.match(todoListHtml, /weeklyLogs/);
  assert.match(todoListHtml, /data-weekly-log/);
  assert.match(todoListHtml, /次数型任务点击记录即可完成一次/);
  assert.match(todoListHtml, /targetSessions = target > 0 \? 0/);
  assert.match(todoListHtml, /weekly-completed/);
  assert.match(todoListHtml, /weekly-remaining/);
  assert.doesNotMatch(todoListHtml, /weekly-progress[\s\S]*weekRangeLabel\(weekly\)/);
});

test("weekly progress is calculated by local Monday-to-Sunday weeks", () => {
  assert.match(todoListHtml, /function weekStartKey\(dateKey\)/);
  assert.match(todoListHtml, /logDate >= weekStart && logDate <= dateKey/);
  assert.match(todoListHtml, /function weeklyTaskProgress\(task, dateKey\)/);
});

test("shared rewards are deduplicated only after a todo date is actually complete", () => {
  assert.match(todoListHtml, /const completedDates = new Set\(confirmedDatesAscending\(\)\.filter/);
  assert.match(todoListHtml, /completedDates\.has\(date\)/);
});

test("daily tasks support per-date morning and afternoon scheduling", () => {
  assert.match(todoListHtml, /timeSlots/);
  assert.match(todoListHtml, /function taskTimeOfDay\(taskId, dateKey\)/);
  assert.match(todoListHtml, /function setTaskTimeOfDay\(taskId, dateKey, value\)/);
  assert.match(todoListHtml, /data-slot="morning"/);
  assert.match(todoListHtml, /data-slot="afternoon"/);
  assert.match(todoListHtml, /timeOfDayRank\(a\.timeOfDay\) - timeOfDayRank\(b\.timeOfDay\)/);
  assert.match(todoListHtml, /renderTimeSlotPicker\(todo\)[\s\S]*repeat-label">每天重复/);
  assert.doesNotMatch(todoListHtml, /time-input|安排时段.*select|>不安排<|data-slot=""/);
});
