# Implementation Plan

This plan intentionally avoids implementing full business functionality in the specification round.

## Phase 0: Specification

Status: complete when this document set exists.

Deliverables:

- `AGENTS.md`
- `PROJECT_SPEC.md`
- `DATA_MODEL.md`
- `API_CONTRACT.md`
- `IMPLEMENTATION_PLAN.md`
- `ACCEPTANCE_TESTS.md`
- `PROGRESS.md`
- `.gitignore`

No business code in this phase.

## Phase 1: Project Skeleton

Goal: create a runnable but minimal app shell.

Tasks:

- Create `package.json`.
- Add Express server skeleton.
- Add static file serving for native frontend files.
- Add `.env.example`.
- Create frontend shell with the four allowed main page tabs: Today, Add Content, Dictation, Library.
- Add a simple health endpoint.
- Add first smoke test.

Tests:

- Server health endpoint returns OK.
- Static app loads.
- No API key appears in frontend files.

## Phase 2: Pure Scheduling Logic

Goal: implement review scheduling without UI or IndexedDB coupling.

Tasks:

- Implement local date helpers.
- Implement correct interval scheduling.
- Implement incorrect handling.
- Implement due-or-overdue selection.
- Implement same-day retry behavior flags.

Tests:

- All fixed intervals.
- Mastered 60-day maintenance.
- Incorrect resets consecutive count and schedules tomorrow.
- Same-day retry correct does not increment long-term count.
- Overdue items are due without penalty.

## Phase 3: IndexedDB Storage Layer

Goal: create stable local persistence APIs.

Tasks:

- Implement IndexedDB open and migration version 1.
- Add stores from `DATA_MODEL.md`.
- Add CRUD helpers for study items, review states, sessions, attempts, reinforcements, settings, and pending enrichments.
- Add export and import helpers for backup and restore.

Tests:

- Database opens and creates all stores.
- Study item and review state round trip.
- Pending enrichment can be confirmed or discarded.
- Backup export/import preserves core data.

## Phase 4: Backend Enrichment API

Goal: enrich input with OpenAI while keeping API key server-side.

Tasks:

- Install and configure OpenAI SDK, Express JSON middleware, and Zod.
- Implement schemas.
- Implement `/api/enrich/english`.
- Implement `/api/enrich/chinese-phrase`.
- Implement `/api/enrich/poem`.
- Implement `/api/enrich/related-words`.
- Use Responses API with `web_search` and Structured Outputs.
- Normalize validation errors.

Tests:

- Request validation rejects bad input.
- Zod rejects malformed model output.
- Endpoint handlers can be tested with mocked OpenAI client.
- `.env` remains ignored.

## Phase 5: Add Content Workflow

Goal: parent can enter minimal input, inspect enrichment, and confirm into the library.

Tasks:

- Build Add Content page interactions.
- Save enrichment as pending draft.
- Confirm English word into one study item and two review states.
- Confirm Chinese phrase into one study item and one whole-item review state.
- Confirm poem into one study item and one whole-item review state per line.

Tests:

- Confirmation creates correct review states.
- Discard does not create study items.
- Poem line states are independent.

## Phase 6: Today And Dictation Workflow

Goal: generate daily tasks and record outcomes.

Tasks:

- Build Today page task generation.
- Include newly confirmed today.
- Include due and overdue review states.
- Build Dictation page.
- Record English spelling and phonetic results independently.
- Record Chinese and poem whole-item results.
- Add same-day retry queue.

Tests:

- Today includes `nextReviewDate <= today`.
- New content appears on created date.
- Wrong answer appears again before session end.
- Same-day retry does not advance long-term count.

## Phase 7: Wrong-Character Reinforcement

Goal: support clicked wrong characters and related-word reinforcement.

Tasks:

- Allow parent to click wrong characters for Chinese phrases and poem lines.
- Mark original whole item incorrect.
- Create or restart character reinforcement states.
- Request related words.
- Require parent confirmation.
- Rotate original carrier and confirmed related words.
- Exit reinforcement after 3 correct reviews across dates.

Tests:

- Wrong character creates reinforcement state.
- Related words are not official study items.
- Correct across 3 dates completes reinforcement.
- Incorrect restarts from next day.

## Phase 8: Library, Settings, Backup

Goal: make the app manageable without adding main pages.

Tasks:

- Build Library page.
- Show item details, review state, and status.
- Archive and unarchive items.
- Add backup and restore modal.
- Add simple settings modal.

Tests:

- Archived items do not appear in Today.
- Backup and restore round trip.
- Settings persist locally.

## Phase 9: Polish And Acceptance

Goal: verify the app against acceptance tests.

Tasks:

- Run full test suite.
- Manual browser smoke test.
- Review no-scope-creep checklist.
- Update `PROGRESS.md`.

Tests:

- All automated tests pass.
- Manual acceptance checklist passes.

