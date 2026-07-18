# Release Notes

## 0.1.0 Final Local Release

Date: 2026-07-18

### Highlights

- Local-first junior-middle-school dictation review app.
- Four fixed pages: Today, Add Content, Dictation, Library.
- Parent-operated paper dictation workflow.
- English, Chinese phrase, and classical poem support.
- OpenAI-backed enrichment through a secure Express backend.
- IndexedDB-only learning data storage.
- Fixed memory review schedule and same-day retry.
- Wrong-character reinforcement with related-word carriers.
- Local reward system and recent 7-day achievement record.
- Todo-list-aligned Luo Tianyi visual styling and completion celebration.

### Added

- Express static server and `/api/health`.
- Enrichment endpoints:
  - `POST /api/enrich/english`
  - `POST /api/enrich/chinese`
  - `POST /api/enrich/poem`
  - `POST /api/enrich/character`
- Zod request and response schemas.
- Responses API integration with `web_search`, Structured Outputs, timeout handling, rate limiting, and `store: false`.
- IndexedDB stores:
  - `items`
  - `reviewEvents`
  - `enrichmentCache`
  - `settings`
- JSON backup export and import.
- Add Content lookup, edit, confirm, duplicate handling, cache reuse, and manual fill.
- Today queue generation for due, overdue, new, and character reinforcement cards.
- Dictation card flow with hidden answers and parent feedback.
- English spelling and phonetic independent tracks.
- Chinese and poem wrong-character position recording.
- Related-word recommendation and parent confirmation.
- Character reinforcement rotation and 3-correct exit.
- Reward panel:
  - 100%: `+¥2`
  - `>=85%`: `+¥1`
  - `<60%`: `-¥1`
- Recent 7-day achievement cards.
- 100% celebration overlay with confetti and Bilibili iframe.
- Final audit and release documentation.

### Verified

- `npm install`: passed.
- `npm start`: passed smoke checks.
- `npm test`: 83 tests passed, 0 failed.

### Not Included By Design

- Accounts.
- Leaderboards.
- OCR.
- Automatic grading.
- Cloud sync.
- Social features.
- Complex reports.
- Database server.
- React, Vue, or complex build tooling.

### Upgrade Notes

- This is schema version `1`.
- Existing browser data should be backed up before future schema upgrades.
- API keys must remain in `.env` and must not be pasted into browser code.

