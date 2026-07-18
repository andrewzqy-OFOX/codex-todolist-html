# Progress

## 2026-07-18

Current phase: Phase 0, specification.

Completed:

- Created project specification document.
- Created IndexedDB-centered data model.
- Created backend enrichment API contract.
- Created staged implementation plan.
- Created acceptance test checklist.
- Updated agent instructions for future development rounds.
- Updated `.gitignore` plan for Node, environment, and local generated files.

Not implemented:

- No Express server.
- No frontend pages.
- No IndexedDB code.
- No OpenAI integration.
- No scheduling logic.
- No tests.
- No business functionality.

Notes:

- This round intentionally stops after requirements, architecture, and planning.
- Future rounds must read all project specification files before coding.

## 2026-07-18 Phase 1

Current phase: Phase 1, project skeleton and local data layer.

Completed:

- Created `dictation-review-app/` project directory.
- Added Express static server and `/api/health`.
- Added native HTML, CSS, and JavaScript frontend shell with four fixed main views.
- Implemented IndexedDB version 1 migration framework.
- Created required object stores: `items`, `reviewEvents`, `enrichmentCache`, and `settings`.
- Added required indexes on `items` and review/cache stores.
- Implemented local data helpers for add, read, update, archive, due-date query, type query, settings, review events, and enrichment cache.
- Implemented JSON backup export and guarded import.
- Added Node test coverage using `fake-indexeddb`.
- Added app-level `README.md` and `.env.example`.

Not implemented:

- No联网查询.
- No OpenAI SDK integration.
- No enrichment confirmation workflow.
- No complete dictation session logic.
- No wrong-character reinforcement workflow.
- No full long-term review scheduler.

Test command:

- `npm install` from `dictation-review-app/`: passed after network approval.
- `npm test` from `dictation-review-app/`: passed, 10 tests.
- `npm start` from `dictation-review-app/`: verified by `GET /api/health` returning HTTP 200.

Manual verification:

- Open `http://localhost:3000` after `npm start`.
- Check the four main navigation tabs.
- Add a local placeholder item from Add Content.
- Confirm it appears in Library and Today summary updates when due.
- Export backup JSON.
- Try importing invalid JSON and confirm the app shows an error without changing existing data.

## 2026-07-18 Phase 2

Current phase: Phase 2, pure review engine and today queue generation.

Completed:

- Added independent pure review modules:
  - `public/js/review-types.js`
  - `public/js/review-engine.js`
  - `public/js/queue-builder.js`
- Added `addDays` local-date helper in `public/js/date-utils.js`.
- Implemented standard review track updates using `[1, 3, 7, 15, 30, 60]`.
- Implemented wrong-after-review reset and next-day scheduling.
- Added same-day retry protection so retry correctness does not advance long-term stage, streak, totals, or next review date.
- Added same-date formal-correct guard so long-term correctness only advances across dates.
- Implemented English `spellingTrack` and `phoneticTrack` updates independently.
- Implemented English queue card merging when both dimensions are due.
- Implemented Chinese and poem-line whole-item feedback handling.
- Implemented selected wrong-character track creation and reactivation.
- Implemented "entire unknown" feedback without guessing or creating character tracks.
- Implemented character reinforcement using `[1, 3, 7]`, with mastery after 3 formal correct reviews.
- Implemented mastered character reactivation after later wrong feedback.
- Implemented today queue generation for overdue, due, newly added, and due character reinforcement cards.
- Added queue ordering to avoid consecutive same-character reinforcement cards when possible.
- Added same-day retry placement with a 3-card gap when possible, end-of-round fallback, and retry cap message.

Not implemented:

- No联网查询.
- No OpenAI SDK integration.
- No enrichment confirmation workflow.
- No visible dictation page wiring for the review engine.
- No persistence integration for review-engine results.
- No related-word recommendation UI.

Test command:

- `npm test` from `dictation-review-app/`: passed, 26 tests.

Full test result:

- 26 tests passed.
- 0 tests failed.
- Covered date format and date rollover, IndexedDB initialization, add/read, index query, backup export/import validation, all standard review intervals, wrong-after-review scheduling, same-day retry non-upgrade, overdue task inclusion without penalty, English dual-dimension independence and merging, partial character errors, entire-unknown feedback, character mastery after 3 correct formal reviews, mastered item reactivation after wrong feedback, and retry queue gap/cap behavior.

## 2026-07-18 Phase 3

Current phase: backend online enrichment API.

Completed:

- Installed `openai`, `zod`, and `dotenv`.
- Updated `.env.example` to list variable names only: `PORT`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
- Refactored Express server to export `createApp` for mock-based tests and to listen only when run directly.
- Kept `GET /api/health` and updated it to report backend enrichment readiness without exposing secrets.
- Added `POST /api/enrich/english`.
- Added `POST /api/enrich/chinese`.
- Added `POST /api/enrich/poem`.
- Added `POST /api/enrich/character`.
- Added Zod request and response schemas for all enrichment endpoints.
- Added Structured Outputs JSON schema generation from Zod schemas.
- Added OpenAI Responses API call wrapper using the official JavaScript SDK.
- Added `web_search` tool configuration and `store: false`.
- Added timeout handling with `AbortController`.
- Added safe error mapping for bad requests, missing API key, model refusal or incomplete output, schema mismatch, network failure, timeout, and rate limiting.
- Added basic in-memory rate limiting for enrichment routes.
- Added mock-based backend tests. Tests do not consume OpenAI API.
- Updated app README with environment variable and API setup notes.

Not implemented:

- No frontend Add Content integration with enrichment endpoints.
- No parent confirmation workflow for enriched data.
- No final dictation UI.
- No persistence of enrichment results into IndexedDB.

Test command:

- `npm test` from `dictation-review-app/`: passed, 38 tests.
- `npm start` from `dictation-review-app/`: verified by `GET /api/health` returning HTTP 200 and phase `backend-enrichment`.

Full test result:

- 38 tests passed.
- 0 tests failed.
- Covered request validation, normal structured response, missing model fields, empty sources, multi-candidate poem output, no-antonym Chinese output, same-title poem ambiguity, network error, timeout, API key absence, rate limiting, and existing local data/review-engine tests.

## 2026-07-18 Phase 4

Current phase: Add Content minimal input, lookup, confirm, and save flow.

Completed:

- Rebuilt Add Content page with three tabs: English words, Chinese terms, and poems.
- Added one-per-line English input.
- Added one-per-line Chinese input.
- Added poem title input with optional author.
- Added query status for waiting, querying, success, and failure.
- Prevented duplicate submit while querying.
- Added local enrichment cache reuse for identical queries.
- Added force refresh through re-query on confirmation cards.
- Added editable confirmation cards showing confidence, warnings, ambiguities/candidates, and sources.
- Added confirm and save, modified save, re-query, cancel, and manual fill paths.
- Ensured fetched but unconfirmed enrichment results remain in cache only and do not enter the formal library.
- Saved confirmed metadata: `sourceRecords`, `fetchedAt`, `userConfirmedAt`, `confidence`, and `originalQuery`.
- Added duplicate checks:
  - English duplicate ignores case.
  - Chinese duplicate requires exact term match.
  - Poem duplicate checks same poem and existing poem lines.
  - Edited poem duplicate lines are rejected before save.
- Added duplicate handling choices: view existing content, update existing content, or cancel.
- Saved poems as one parent `poem` record plus linked `poem_line` records with `parentPoemId`, `lineIndex`, `title`, and `author`.
- Kept poem translation and annotations in the parent payload for reference only.
- Updated Library rendering to show confirmed records.
- Updated README with Add Content flow and manual test checklist.

Not implemented:

- No complete listening/dictation interaction.
- No wrong-character UI.
- No automatic live OpenAI manual verification in tests.
- No final daily task UI wiring beyond existing due summary.

Test command:

- `npm test` from `dictation-review-app/`: passed, 48 tests.
- `npm start` from `dictation-review-app/`: verified `GET /api/health` HTTP 200 and `/` HTTP 200.

Full test result:

- 48 tests passed.
- 0 tests failed.
- Added coverage for cache reuse, force refresh, unconfirmed data not entering the library, confirmed metadata save, English duplicate ignoring case, duplicate update path, poem parent and line save, repeated poem detection, repeated edited poem lines, and input line splitting.

Manual test checklist for a live API key:

- Normal English word.
- Polysemous English word.
- Chinese term.
- Chinese term without clear antonym.
- Polyphonic term.
- Poem.
- Same-title or candidate-heavy poem.
- Manual save after network failure.
- Duplicate add with view/update/cancel handling.

## 2026-07-18 Phase 5

Current phase: Today task and dictation feedback workflow.

Completed:

- Implemented Today task statistics:
  - Today's newly confirmed count.
  - Regular review count.
  - Wrong-character reinforcement count.
  - Overdue count.
  - Total task count.
- Added start buttons for all tasks, English only, Chinese only, poem only, and wrong-character reinforcement only.
- Added `public/js/dictation-session.js` as the session layer for card views, character tokenization, session state, summary counts, same-day retry persistence, and result recording.
- Wired Dictation page to display one paper-dictation card at a time.
- Kept answers hidden until the parent clicks "show answer".
- Implemented English card behavior:
  - Spelling-only cards show Chinese meanings and parts of speech, hiding English spelling.
  - Phonetic-only cards show the English word and hide phonetics.
  - Dual-dimension cards record correct, spelling wrong, phonetic wrong, or both wrong.
  - Only tested dimensions are updated.
- Implemented Chinese and poem-line card behavior:
  - Parent reads the prompt.
  - Wrong flow shows the answer and clickable character buttons.
  - Punctuation and spaces are not clickable.
  - Repeated characters are recorded by character position and character value.
  - Whole-item unknown records no guessed character tracks.
  - Optional student answer notes are saved on review events.
- Implemented same-day retry:
  - Wrong cards are requeued through the existing 3-card-gap retry scheduler.
  - Retry attempts save `isSameDayRetry: true`.
  - Same-day correct retry does not upgrade long-term review stage.
  - Retry cap contributes to the "tomorrow continue" summary count.
- Added completion summary:
  - Formal dictation count.
  - Correct count.
  - Wrong count.
  - Spelling wrong count.
  - Phonetic wrong count.
  - Chinese wrong-character count.
  - Poem wrong-character count.
  - Same-day retry results.
  - Tomorrow-continue count.
- Added localStorage session recovery for unfinished sessions after refresh; invalid or completed sessions are safely cleared.
- Updated README with Today and Dictation workflow notes.

Not implemented:

- No related-word recommendation UI for wrong-character reinforcement.
- No complex reports or trend charts.
- No automatic grading or student text entry requirement.

Test command:

- `npm test` from `dictation-review-app/`: passed, 58 tests.
- `npm start` from `dictation-review-app/`: verified `GET /api/health`, `/`, and `/js/app.js` all return HTTP 200.

## 2026-07-18 Phase 6

Current phase: wrong-character related-word reinforcement.

Completed:

- Added `public/js/character-reinforcement.js` for character recommendation lookup, cache reuse, safe failure fallback, local filtering, and manual related-word normalization.
- Updated character reinforcement track shape with `originalItemId`, `wrongCount`, `relatedWords`, and `currentRotationIndex`.
- Updated default character intervals to `[3, 7, 7]`.
- Implemented reinforcement exit rules:
  - First formal correct review schedules 3 days later.
  - Second formal correct review schedules 7 days later.
  - Third formal correct review marks the track mastered and inactive.
  - Same-day retry correctness does not count.
  - Wrong reinforcement review resets streak/stage and schedules tomorrow.
- Preserved inactive history and reactivated the same character track when the same original item is later missed again.
- Kept one active character track per selected character per original item.
- Added related-word confirmation UI after the parent selects concrete wrong characters.
- Ensured selecting "entire word/sentence unknown" does not query related words.
- Required parent confirmation before recommended words become reinforcement carriers.
- Supported skipping all recommended words and manually adding one related word.
- Capped confirmed automatic related words at two and filtered out words that do not contain the target character or exactly duplicate the original text.
- Kept related words inside the character track only; they are not formal study items and do not trigger recursive related-word lookup.
- Updated character reinforcement cards to rotate between the original carrier and confirmed related words.
- Added modest responsive styling for related-word confirmation controls.
- Updated README with wrong-character reinforcement behavior.

Not implemented:

- No new main pages.
- No automatic grading, OCR, complex reports, accounts, cloud sync, or social features.
- No live OpenAI manual acceptance pass was performed in this automated round.

Test command:

- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: verified `/` returns HTTP 200 and `/api/health` returns phase `backend-enrichment`.

Full test result:

- 68 tests passed.
- 0 tests failed.
- Added coverage for single-character recommendation, parent cancellation, manual related words, maximum two related words, carrier rotation, three formal correct reviews exiting reinforcement, same-day correct retry not counting, wrong reset, reactivation of the same character, non-recursive related words, and network-failure fallback that still allows original wrong-character review.

## 2026-07-18 Phase 7

Current phase: final visual polish, reward system, and recent achievement records.

Completed:

- Reworked the frontend visual style to align with the existing todo-list program:
  - Cyan-blue primary palette.
  - Translucent panel styling.
  - Rounded cards and pill buttons.
  - Luo Tianyi themed background and avatar imagery.
  - Reward-card layout and recent 7-day card layout.
- Kept the four fixed main pages only: Today, Add Content, Dictation, Library.
- Added Luo Tianyi image assets under `dictation-review-app/public/assets/`.
- Added `public/js/daily-rewards.js` as a pure reward and achievement calculation module.
- Added a local reward panel on the Today page.
- Added recent 7-day achievement records on the Today page.
- Implemented reward rules:
  - 100% daily review completion earns `¥2`.
  - Completion rate at or above 85% earns `¥1`.
  - Completion rate below 60% deducts `¥1`.
  - Completion rate from 60% to 84% has no money change.
- Completion rate is based on formal dictation cards completed divided by the full daily due queue captured when a session starts.
- Multiple sessions on the same date accumulate into the same local daily achievement record.
- Stored reward records in IndexedDB settings as `dailyAchievementRecords`.
- Preserved existing overdue behavior: unfinished due items remain due because `nextReviewDate <= today` continues to include them in later task queues.
- Added 100% celebration behavior:
  - Confetti/firework-style animation.
  - Random Luo Tianyi Bilibili iframe using the same embed style as the todo-list program.
  - Bilibili fallback message if the iframe does not load.
  - Close button and Escape-key close behavior.
- Updated README with style, reward, and celebration behavior.

Not implemented:

- No account, leaderboard, social sharing, cloud sync, OCR, automatic grading, or complex analytics.
- No new independent report page; reward and 7-day history remain inside Today.
- No live browser visual screenshot audit was run in this round.

Test command:

- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: verified `/`, `/css/styles.css`, `/js/app.js`, `/assets/luo-tianyi-memory.jpg`, and `/api/health` return HTTP 200.

Full test result:

- 77 tests passed.
- 0 tests failed.
- Added coverage for reward thresholds, same-day achievement accumulation, target-count preservation, reward balance, and recent 7-day summary generation.

## 2026-07-18 Phase 8

Current phase: final acceptance, repair, and delivery.

Completed:

- Re-read all project specification documents before final audit.
- Reviewed backend enrichment, schemas, IndexedDB data layer, backup/restore, add-content flow, review engine, queue builder, dictation session, reward module, and UI wiring.
- Added final integration and audit tests covering:
  - English confirm-to-review flow.
  - Spelling-only wrong behavior.
  - Same-day retry behavior.
  - Next-day due behavior after wrong feedback.
  - Chinese no-antonym case, wrong-character flow, related-word confirmation, rotation, and 3-date exit.
  - Poem parent and independent line save behavior.
  - Poem-line wrong-character reinforcement.
  - Repeated character positions, punctuation, and spaces.
  - Old settings without reward records.
  - About 1000 active study items in the Today queue.
- Verified `npm install`.
- Verified `npm start` with HTTP smoke checks.
- Verified `npm test`.
- Rewrote app `README.md` into a clean final delivery document.
- Created `dictation-review-app/FINAL_AUDIT.md`.
- Created `dictation-review-app/RELEASE_NOTES.md`.
- Performed security scan for obvious secret patterns and debugging leftovers.

Not changed:

- No new product features were added in this final phase.
- No account, leaderboard, OCR, automatic grading, cloud sync, social feature, database server, React, Vue, or complex report was added.

Final command results:

- `npm install`: passed, 0 vulnerabilities.
- `npm start`: passed smoke checks for `/`, `/css/styles.css`, `/js/app.js`, and `/api/health`.
- `npm test`: passed with 83 tests.

Final test result:

- 83 tests passed.
- 0 tests failed.

Known final limitations:

- Live OpenAI enrichment must be manually accepted with a real `.env` API key.
- Bilibili iframe playback depends on browser and Bilibili availability.
- Data is local to the browser and requires JSON backup/restore for transfer.

## 2026-07-18 UI Comment Fixes

Current phase: post-delivery visual and interaction fixes from browser comments.

Completed:

- Renamed the visible app title to `小葵の背默`.
- Reworked the main layout into a todo-list-like structure:
  - Left side: Today, Dictation, and Library content.
  - Right side: reward record panel and bottom-right Add New Words panel.
- Removed the standalone top navigation entry for Add Content and kept adding content as a right-side working panel.
- Moved the reward system out of the Today flow and into the right column.
- Changed task start labels to `English Words`, `中文生词`, and `古诗词`.
- Removed the separate `只听错字强化` button and folded Chinese-term character reinforcement into the `中文生词` queue.
- Updated the header image treatment and background coverage so the background fills the page.
- Improved main navigation button styling.
- Added a visible warning when opening `public/index.html` directly through `file://`, because the app should be run with `npm start` at `http://localhost:3000`.
- Added a focused test for the new Chinese-mode character-reinforcement behavior.

Test command:

- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/`, `/css/styles.css`, `/js/app.js`, and `/api/health`.

Full test result:

- 84 tests passed.
- 0 tests failed.

## 2026-07-18 Add Content Failure Handling Fix

Current phase: post-delivery add-content usability fix.

Completed:

- Rewrote `public/js/add-content-ui.js` visible text from garbled copy to normal Chinese.
- Improved query-failure behavior:
  - Query failure now creates manual-fill cards automatically.
  - The status message explains that `file://` cannot use the backend enrichment API and recommends `npm start` with `http://localhost:3000`.
- Improved manual JSON handling:
  - The editor accepts either raw `data` JSON or a full enrichment envelope.
  - Missing envelope fields are filled with safe defaults.
  - Empty optional English fields such as `ukPhonetic`, `usPhonetic`, `partsOfSpeech`, `meaningsZh`, and `alternativeCandidates` can still be saved.
- Added a focused test for saving the simplified manual English JSON shape.

Test command:

- `node --check public/js/add-content-ui.js`: passed.
- `node --check public/js/app.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/`, `/js/add-content-ui.js`, and `/api/health`.

Full test result:

- 85 tests passed.
- 0 tests failed.

## 2026-07-18 Layout And Today Stats Comment Fixes

Current phase: post-delivery browser-comment UI refinement.

Completed:

- Changed the header treatment to a pinker Luo Tianyi visual direction using a pink overlay and alternate image composition.
- Merged the main navigation and dictation start controls into one command bar.
- Moved backup import/export controls out of the header and into the bottom of the left content column.
- Made the Today title area smaller and moved the explanatory copy into the title block.
- Changed Today summary cards to match the start-button categories:
  - `English Words`
  - `中文生词`
  - `古诗词`
  - `逾期任务`
  - `全部背默`
- Removed the visible `今日错字强化` summary card.
- Added stats fields for English, Chinese, and poem task counts and a focused test to keep this UI/backend口径 aligned.
- Rewrote `public/js/ui.js` visible strings into normal Chinese.

Test command:

- `node --check public/js/ui.js`: passed.
- `node --check public/js/queue-builder.js`: passed.
- `node --check public/js/app.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/`, `/css/styles.css`, `/js/ui.js`, and `/api/health`.

Full test result:

- 86 tests passed.
- 0 tests failed.

## 2026-07-18 Static HTML / iPad Usage Simplification

Current phase: post-delivery static deployment usability fix.

Completed:

- Replaced the blocking `npm start` warning with a friendly static-version note.
- Static usage now treats manual entry as the primary path:
  - `file://` opening is detected as static mode.
  - GitHub Pages (`*.github.io`) is detected as static mode.
  - In static mode, clicking the query button creates manual-fill cards directly instead of trying a backend API call.
  - The query button text changes to `生成填写卡片` in static mode.
- Kept local backend mode intact for optional AI enrichment at `localhost`.
- Added a focused test for static frontend location detection.
- Rewrote `dictation-review-app/README.md` with static GitHub Pages / iPad usage first, and backend AI enrichment as an optional section.

Test command:

- `node --check public/js/add-content-ui.js`: passed.
- `node --check public/js/app.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/`, `/js/add-content-ui.js`, and `/api/health`.

Full test result:

- 87 tests passed.
- 0 tests failed.

## 2026-07-18 Shared Reward Bridge With Todo List

Current phase: post-delivery reward integration refinement.

Completed:

- Added a shared local reward ledger key: `xiaokui-shared-reward-ledger-v1`.
- The dictation app now writes one idempotent shared reward entry per review date after daily achievement is finalized.
- The dictation app reads the existing todo-list storage key `pretty-todo-list-v2` when available and shows the combined shared balance.
- Updated `todo-list.html` so its reward balance includes shared dictation reward entries.
- Kept todo-list task reward, penalty, redemption, and streak rules unchanged.
- Added tests for:
  - todo-list reward calculation with shared dictation entries.
  - one-entry-per-date dictation reward sync.
  - dictation app reading the todo-list balance when both apps share one browser origin.

Limitations:

- This bridge works only when both pages run in the same browser origin, for example the same GitHub Pages site on the same iPad browser.
- If the two files are opened from different domains, different apps, or different browsers, browser storage isolation prevents automatic reward sharing.

Test command:

- `node --check public/js/daily-rewards.js`: passed.
- `node --check public/js/app.js`: passed.
- `todo-list.html` inline script syntax check with `vm.Script`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/`, `/js/app.js`, and `/api/health`.

Full test result:

- 90 tests passed.
- 0 tests failed.

## 2026-07-18 Custom Luo Tianyi Images And iPad Icon

Current phase: post-delivery visual asset refinement.

Completed:

- Copied the user-provided Luo Tianyi wallpaper into the app as `public/assets/xiaokui-main.png`.
- Copied the user-provided avatar into the app as `public/assets/xiaokui-avatar.webp`.
- Generated `public/assets/xiaokui-icon.png` from the avatar for browser favicon and iPad home-screen icon usage.
- Updated `public/css/styles.css` so the wallpaper is used for the page background and header main image.
- Updated the reward panel avatar to use the new avatar image.
- Added `public/manifest.webmanifest`.
- Updated `public/index.html` with `apple-touch-icon`, favicon, and manifest links.

Test command:

- `node --check public/js/app.js`: passed.
- `public/manifest.webmanifest` JSON parse check: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/`, `/css/styles.css`, `/assets/xiaokui-main.png`, `/assets/xiaokui-avatar.webp`, `/assets/xiaokui-icon.png`, and `/manifest.webmanifest`.

Full test result:

- 90 tests passed.
- 0 tests failed.

## 2026-07-18 Reward Redemption Records

Current phase: post-delivery reward panel refinement.

Completed:

- Added a reward redemption form under the reward rules in the dictation app reward panel.
- Added local redemption records in IndexedDB settings as `rewardRedemptions`.
- Added recent redemption display, matching the todo-list reward-store pattern.
- Updated reward balance calculation so local redemptions subtract from the dictation reward balance.
- Synced dictation redemption records into the shared reward ledger as negative entries.
- Updated the todo-list bridge summary so shared negative entries count toward the visible redeemed amount without double-deducting from balance.
- Added tests for redemption totals, validation, and shared-ledger deduction sync.

Test command:

- `node --check public/js/daily-rewards.js`: passed.
- `node --check public/js/app.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/`, `/css/styles.css`, `/js/app.js`, and `/api/health`.

Full test result:

- 93 tests passed.
- 0 tests failed.

## 2026-07-18 Header Image Face Crop Fix

Current phase: post-delivery visual refinement.

Completed:

- Adjusted the header wallpaper crop so Luo Tianyi's face is visible in the title banner.
- Changed the desktop header background position from right-centered cropping to `center 24%`.
- Changed the mobile header background position to `center 22%`.
- Reduced the right-side header overlay opacity so the character remains visible while the title text stays readable.

Test command:

- `node --check public/js/app.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/`, `/css/styles.css`, and `/assets/xiaokui-main.png`.

Full test result:

- 93 tests passed.
- 0 tests failed.

## 2026-07-18 English Fill Card Template Clarification

Current phase: post-delivery add-content usability refinement.

Completed:

- Changed the static-mode query button text from `生成填写卡片` to `生成填写卡`.
- Added a focused test to ensure English fill cards use the simple editable JSON shape:
  - `normalizedWord`
  - `ukPhonetic`
  - `usPhonetic`
  - `partsOfSpeech`
  - `meaningsZh`
  - `alternativeCandidates`
- Confirmed the existing manual-save path accepts and saves this direct JSON shape without requiring an outer response envelope.

Test command:

- `node --check public/js/add-content-ui.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.
- `npm start` from `dictation-review-app/`: HTTP smoke check returned 200 for `/` and `/js/add-content-ui.js`.

Full test result:

- 94 tests passed.
- 0 tests failed.

## 2026-07-18 Static Add Content Fallback

Current phase: post-delivery browser usability fix.

Completed:

- Added `public/js/static-fallback.js` as a classic-script fallback for direct browser/static HTML usage.
- Added a module-ready marker in `public/js/app.js` so the fallback only activates if the normal ES module app fails to load.
- The fallback makes the Add New Words area usable when opening `public/index.html` directly:
  - Add-content tabs switch correctly.
  - `生成填写卡` creates editable JSON cards.
  - English cards use the requested simple shape with `normalizedWord`, `ukPhonetic`, `usPhonetic`, `partsOfSpeech`, `meaningsZh`, and `alternativeCandidates`.
  - Confirmed manual cards are saved into the same IndexedDB `items` store where possible.
- Kept the normal module-based app path unchanged for localhost and GitHub Pages.

Test command:

- `node --check public/js/static-fallback.js`: passed.
- `node --check public/js/app.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.

Full test result:

- 94 tests passed.
- 0 tests failed.

## 2026-07-18 Header Command Bar And Footer Note Layout

Current phase: post-delivery browser-comment layout refinement.

Completed:

- Moved the main navigation and dictation start buttons into the title/header banner so they read as one integrated top section.
- Removed the separate command-bar panel between the header and Today content.
- Moved the static-version note to the bottom of the page.
- Restyled the static-version note as smaller, quieter footer text.
- Kept existing navigation and dictation start button data attributes unchanged.

Test command:

- `node --check public/js/app.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.

Full test result:

- 94 tests passed.
- 0 tests failed.

## 2026-07-18 Manual Add Save ID Compatibility Fix

Current phase: post-delivery manual-add usability fix.

Completed:

- Fixed manual English fill-card save failures in static browser usage when `crypto.randomUUID()` is unavailable.
- Added `createLocalId()` in `public/js/add-content.js` with a safe fallback ID format.
- Updated English, Chinese, poem parent, and poem-line creation to use the safe ID helper.
- Updated `public/js/static-fallback.js` to avoid directly referencing `crypto` when it is unavailable.
- Added a focused test for ID creation without `randomUUID`.

Test command:

- `node --check public/js/add-content.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `npm test` from `dictation-review-app/`: first sandboxed attempt failed with `spawn EPERM`; rerun with approved elevated execution passed.

Full test result:

- 95 tests passed.
- 0 tests failed.

## 2026-07-18 HTML Reopen Fix

Current phase: post-delivery static HTML repair.

Completed:

- Rewrote `dictation-review-app/public/index.html` as clean UTF-8 HTML after malformed mojibake tags caused the static page to stop opening.
- Restored complete closing tags for the page title, header title, buttons, labels, and content sections.
- Preserved all required element IDs and data attributes used by existing JavaScript:
  - `today-summary`
  - `reward-summary`
  - `add-content-form`
  - `query-button`
  - `manual-button`
  - `enrichment-results`
  - `data-view`
  - `data-start-mode`
- Kept the command bar inside the header and the static-version note at the bottom.

Verification:

- Node text check confirmed `</title>` exists.
- Node text check confirmed `</h1>` exists.
- Node text check confirmed all 4 dictation start buttons remain present.
- `node --check public/js/app.js`: passed.
- `node --check public/js/add-content.js`: passed.
- `node --check public/js/static-fallback.js`: passed.

Test limitation:

- `npm test` inside the sandbox still failed with `spawn EPERM`.
- The approved elevated retry was blocked by the environment usage limit, so a full test rerun could not be completed in this turn.

## 2026-07-18 Static Save Fallback Repair

Current phase: post-delivery static HTML usability repair.

Completed:

- Added a localStorage fallback path in `public/js/db.js` for browsers where IndexedDB fails under direct `file://` usage.
- Updated `app.js` so IndexedDB initialization failure no longer stops page startup; the app continues through the storage fallback when available.
- Updated Add Content confirmation cards to show persistent in-card save errors instead of only a short toast.
- Kept IndexedDB as the primary storage path and localStorage only as a fallback.
- Added focused coverage for localStorage fallback when IndexedDB is unavailable.

Verification:

- `node --check public/js/db.js`: passed.
- `node --check public/js/app.js`: passed.
- `node --check public/js/add-content-ui.js`: passed.
- `node --check public/js/add-content.js`: passed.
- `node tests/db.test.js`: passed, 5 tests.
- `node tests/add-content.test.js`: passed, 14 tests.

Test limitation:

- Full `npm test` still fails in the sandbox with `spawn EPERM` because the Node test runner cannot spawn worker processes in this environment.
- Elevated full-test retry was not attempted again because the previous attempt was blocked by the environment usage limit.

## 2026-07-18 Today-Only Dictation Actions Layout

Current phase: post-delivery browser-comment layout refinement.

Completed:

- Moved the dictation start buttons out of the header command bar.
- Placed `全部背默`, `English Words`, `中文生词`, and `古诗词` inside the Today view below the task summary cards.
- Kept the main header command bar focused on page navigation only.
- Restyled the Today dictation buttons as smaller color-coded controls with clearer category separation.
- Kept all existing `data-start-mode` attributes unchanged so existing dictation logic continues to bind normally.

Verification:

- Node text check confirmed the header no longer contains `data-start-mode`.
- Node text check confirmed all 4 dictation start buttons still exist.
- `node --check public/js/app.js`: passed.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `node tests/dictation-session.test.js`: passed, 10 tests.

## 2026-07-18 JSON Editor Spellcheck Styling Fix

Current phase: post-delivery add-content usability clarification.

Completed:

- Confirmed the screenshot was showing browser spellcheck underlines and textarea focus styling, not an app save error.
- Disabled spellcheck, autocomplete, and autocapitalize on generated JSON editor textareas.
- Applied a consistent blue focus style to form fields so the JSON editor no longer appears as an orange warning state.
- Kept the manual JSON shape and save behavior unchanged.

Verification:

- `node --check public/js/add-content-ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node tests/add-content.test.js`: passed, 14 tests.

## 2026-07-18 Offline Direct Save And Later Online Enrichment

Current phase: post-delivery iPad/static HTML usability repair.

Completed:

- Added a two-mode add-content flow:
  - Static `file://` or GitHub Pages mode uses “直接保存” by default and records only the entered word, term, poem title, or sentence.
  - Backend mode keeps “联网查询” for full OpenAI enrichment through the Express server.
- Kept “生成填写卡” as an optional advanced manual-edit path instead of forcing parents to edit JSON.
- Added manual low-confidence drafts that still enter the normal learning library and today queue.
- Preserved later online completion by keeping “联网补全” in the Library for English words, Chinese terms, and poem parent records.
- Repaired mojibake-broken JavaScript strings that prevented the page from opening and buttons from responding.
- Rewrote the app README with clear iPad/GitHub Pages static usage and computer-backend enrichment usage.
- Fixed category start buttons so English/Chinese/poem buttons start the filtered queue they advertise.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/add-content-ui.js`: passed.
- `node --check public/js/add-content.js`: passed.
- `node --check public/js/ui.js`: passed.
- `npm test`: passed, 96 tests.

## 2026-07-18 Static Browser Version Consistency Fix

Current phase: post-delivery browser consistency repair.

Completed:

- Rebuilt `dictation-review-app/public/index.html` as clean UTF-8 after detecting mojibake and broken tags in the saved HTML file.
- Aligned the Add Content DOM with the current JavaScript contract:
  - `#add-results`
  - `.add-panel[data-kind]`
  - clean Chinese labels and placeholders
- Added version query strings to the app CSS and JS references so normal browsers are less likely to keep stale cached assets.
- Confirmed no remaining mojibake markers in the public HTML, JavaScript, or CSS files.

Verification:

- HTML text check confirmed the clean title, add-results container, tab panel attributes, and versioned CSS/JS references.
- `node --check public/js/app.js`: passed.
- `node --check public/js/add-content-ui.js`: passed.
- `node --check public/js/add-content.js`: passed.
- `node --check public/js/ui.js`: passed.
- `npm test`: passed, 96 tests.

## 2026-07-18 Plain Browser Static Fallback Repair

Current phase: post-delivery plain browser usability repair.

Completed:

- Rebuilt `public/js/static-fallback.js` as a clean UTF-8 static browser fallback.
- Changed fallback Add Content behavior from JSON-card-first to direct save:
  - Primary button becomes “直接保存”.
  - Secondary button becomes “生成填写卡”.
  - Saved items include low-confidence manual metadata for later online enrichment.
- Updated fallback DOM selectors to match the current HTML:
  - `#add-results`
  - `.add-panel[data-kind]`
- Added fallback navigation binding, add-tab switching, today summary refresh, and library refresh for browsers where ES modules do not run from `file://`.
- Updated cache-busting version query strings for CSS, fallback JS, and app JS.

Verification:

- `node --check public/js/static-fallback.js`: passed.
- `node --check public/js/app.js`: passed.
- `node --check public/js/add-content-ui.js`: passed.
- `node tests/add-content.test.js`: passed, 14 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Dictation And Library Mode Buttons Placement

Current phase: post-delivery interaction cleanup.

Completed:

- Removed the four mode buttons from the Today view so Today only shows task counts and recent progress.
- Moved the four dictation mode buttons under the Dictation view:
  - `全部背默`
  - `English Words`
  - `中文生词`
  - `古诗词`
- Added a separate four-button filter row under the Library view:
  - `全部内容`
  - `English Words`
  - `中文生词`
  - `古诗词`
- Wired Library filter buttons to filter visible library items without starting dictation.
- Updated Dictation default message to “请选择上方范围开始背默。”
- Updated the plain-browser fallback script so the same button placement works even when the ES module app does not run.
- Bumped cache-busting query strings for CSS and JS assets.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `node tests/dictation-session.test.js`: passed, 10 tests.
- `node tests/add-content.test.js`: passed, 14 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Library Card Metrics And Learned Summary

Current phase: post-delivery library layout refinement.

Completed:

- Moved learned-count statistics to the Today view under an “已学会” section.
- Split learned counts by:
  - `English Words`
  - `中文生词`
  - `古诗句`
  - `合计`
- Removed per-card “联网补全” buttons from Library cards.
- Added one Library-level “一键联网补全” button beside the Library title.
- Updated Library cards so item properties appear on the right:
  - relative next-review label such as “今天复习” or “3 天后复习”
  - correct count such as `正确 6/9`
  - large accuracy percentage
- Kept per-card archive action.
- Updated the plain-browser fallback Library card rendering to match the new card layout and Today learned summary.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `node tests/dictation-session.test.js`: passed, 10 tests.
- `node tests/add-content.test.js`: passed, 14 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Today Learned And History Module Layout

Current phase: post-delivery Today layout refinement.

Completed:

- Moved the “已学会” section above “今日任务”.
- Converted Today into three separate modules:
  - “已学会”
  - “今日任务”
  - “最近 7 天”
- Restyled “已学会” as a standalone panel with larger heading text and a softer pink/green card treatment.
- Restyled “最近 7 天” as a smaller standalone module with tighter padding, smaller cards, and lighter text scale.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node tests/daily-rewards.test.js`: passed, 15 tests.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Today Task Air Layout Fix

Current phase: post-delivery Today layout refinement.

Completed:

- Fixed the Today task stat cards so they no longer stretch to fill the whole content width.
- Changed desktop/tablet Today task cards to fixed-width compact cards with left alignment and intentional empty space.
- Added a little more inner padding to the Today task panel so the title and cards no longer feel pressed against the edge.
- Kept narrow mobile cards full-width in two columns for touch usability.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Today Grid And Reward Visibility Fix

Current phase: post-delivery browser-comment layout refinement.

Completed:

- Changed the Today task summary so the first row has four equal cards: English, Chinese, poem, and overdue tasks.
- Moved `全部背默` into its own full-width summary row and made its label and number more prominent.
- Added more side padding inside the Today task panel so the row has breathing room.
- Increased the `最近 7 天` heading size to match the Today task heading scale.
- Added a low-opacity Luo Tianyi screenshot background to the `已学会` summary cards.
- Increased contrast on the reward balance card so `累计奖励` and the amount remain visible in plain browser rendering.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node --check public/js/app.js`: passed.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `node tests/daily-rewards.test.js`: passed, 15 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Static Browser Reward Summary Fix

Current phase: post-delivery static-browser reward repair.

Completed:

- Added reward summary rendering to the static browser fallback.
- Static `file://` and GitHub Pages usage now shows `累计奖励`, `今日达成率`, `今日完成`, `今日奖励`, and `已抵扣`.
- Added static fallback rendering for the recent reward redemption list, including the empty state.
- Wired the static fallback `记录抵扣` form to save local redemption records into IndexedDB settings and refresh the reward summary.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/static-fallback.js`: passed.
- `node --check public/js/app.js`: passed.
- `node tests/daily-rewards.test.js`: passed, 15 tests.
- `node tests/add-content.test.js`: passed, 14 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Today Task Card Proportion Repair

Current phase: post-delivery visual proportion refinement.

Completed:

- Fixed the plain-browser Today task statistics layout that squeezed five cards into one thin row.
- Changed Today task cards to a calmer three-column desktop/tablet layout and two-column narrow-screen layout.
- Restored more comfortable card height, padding, value size, and label spacing.
- Kept Today task colors in the blue-white system, separate from the pink learned panel.
- Slightly balanced the compact recent seven-day card sizing so it no longer collapses visually.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `node tests/daily-rewards.test.js`: passed, 15 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Plain Browser Today Panel Cleanup

Current phase: post-delivery plain-browser visual consistency repair.

Completed:

- Removed the pink visual treatment from the `已学会` panel and returned it to the blue-white/soft mint system.
- Reduced Today task statistic cards again with a tighter but readable card size.
- Kept the Today task panel blue-white and visually separate from reward content.
- Changed recent seven-day cards to a stable compact grid that does not collapse into an empty title row.
- Added recent seven-day rendering to the static browser fallback so direct `file://` and GitHub Pages usage match the module app.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/static-fallback.js`: passed.
- `node --check public/js/app.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node tests/daily-rewards.test.js`: passed, 15 tests.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Library Footer Enrichment Controls

Current phase: post-delivery Library layout refinement.

Completed:

- Moved the Library one-click enrichment action out of the top-right header area.
- Placed the small explanation and the smaller `一键补全` button below the Library list, aligned to the lower-left.
- Kept the existing `library-enrich-all-button` id so the current enrichment handler still binds to the moved button.
- Added a compact mobile layout for the lower-left Library tool row.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node tests/add-content.test.js`: passed, 14 tests.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Compact Today Cards And Pink Learned Panel

Current phase: post-delivery visual density refinement.

Completed:

- Reduced Today task statistic card height, padding, gap, value size, and label size.
- Made the “已学会” panel clearly pink with a stronger pink border and pink-tinted summary cards.
- Reduced the “最近 7 天” module padding, heading size, card height, day rate size, badge size, and mini-stat size.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node tests/daily-rewards.test.js`: passed, 15 tests.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 Balanced Today Task Cards

Current phase: post-delivery visual proportion refinement.

Completed:

- Restored the Today task module to a blue-white visual treatment so it no longer reads as pink.
- Reduced Today task statistic cards with better proportions:
  - smaller radius
  - slightly smaller padding
  - smaller value and label text
  - five-card layout preserved on tablet widths for less stretched cards
- Further compacted the recent seven day section:
  - seven-card layout on tablet widths
  - smaller cards and typography
- Kept the learned section pink.
- Bumped CSS/JS cache-busting query strings.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `node tests/daily-rewards.test.js`: passed, 15 tests.
- `node tests/queue-builder.test.js`: passed, 7 tests.
- `npm test`: passed, 96 tests.

## 2026-07-18 iPad Todo-List Layout Alignment

Current phase: post-delivery iPad/browser layout refinement.

Completed:

- Aligned the dictation app responsive layout with the existing todo-list layout:
  - desktop keeps a left content column and a 320px right sidebar
  - iPad widths from 701px to 1180px keep a two-column layout with a narrower sticky sidebar
  - phone widths at 700px and below switch to one column
- Tightened Today task statistic cards so the four category cards fit one row cleanly and the larger total card remains visually separate.
- Restored Recent 7 Days to a fuller todo-list-like record strip on desktop, four-per-row on iPad, and two-per-row on phones.
- Made the reward balance card span the full reward grid so the cumulative reward is visible in static browser mode.
- Updated static asset cache-busting strings for CSS and JS.

Verification:

- `node --check public/js/app.js`: passed.
- `node --check public/js/ui.js`: passed.
- `node --check public/js/static-fallback.js`: passed.
- `npm test`: passed, 96 tests.

## 2026-07-18 Pre-Publish Check

Current phase: GitHub upload readiness check.

Completed:

- Re-read the specification documents before publishing.
- Confirmed no `.env` file is present under `dictation-review-app/`.
- Scanned for obvious API key leaks; only documented placeholder environment variable examples were found.
- Confirmed static iPad/GitHub Pages mode remains supported by direct-save fallback.
- Confirmed the Git remote is `https://github.com/andrewzqy-OFOX/codex-todolist-html.git`.

Verification:

- `npm install`: passed, 0 vulnerabilities.
- `npm test`: passed, 96 tests.
- Local HTTP smoke test with `npm start`: `/`, `/css/styles.css`, and `/api/health` returned HTTP 200.

## 2026-07-18 Recent History Empty Badge Cleanup

Current phase: post-publish visual polish.

Completed:

- Replaced the dark filled empty-state badge in Recent 7 Days with a light outlined badge.
- Kept successful and penalty reward badges colored so meaningful records remain easy to spot.
- Updated static asset cache-busting strings for GitHub Pages and iPad refreshes.

Verification:

- `npm test`: passed, 96 tests.

## 2026-07-18 Recent History Pending Label Simplification

Current phase: post-publish visual polish.

Completed:

- Simplified empty Recent 7 Days cards to show only `待完成` in the status badge.
- Removed the extra `0` and `暂无记录` text from empty history badges.
- Removed the extra `暂无复习记录` line for days without a target count.
- Updated static asset cache-busting strings for GitHub Pages and iPad refreshes.

Verification:

- `npm test`: passed, 96 tests.
