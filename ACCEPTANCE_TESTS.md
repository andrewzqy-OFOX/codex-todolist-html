# Acceptance Tests

These tests define the product boundary and expected behavior. They should guide automated and manual testing as implementation proceeds.

## Scope Tests

- The app has exactly four main pages: Today, Add Content, Dictation, Library.
- Backup, restore, and simple settings are not independent main pages.
- There are no account, leaderboard, OCR, automatic grading, cloud sync, social, or complex report features.
- Browser storage uses IndexedDB for learning data.
- No database server is required.
- Frontend uses native HTML, CSS, and JavaScript.
- API key is only read by backend `.env`.

## Enrichment Tests

### English

- Given only an English word, enrichment returns standard spelling, British phonetic, American phonetic, parts of speech, 1 to 3 Chinese meanings, sources, confidence, and ambiguity notes.
- The parent must confirm enrichment before it becomes a study item.
- Confirmation creates independent `spelling` and `phonetic` review states.

### Chinese Phrase

- Given only a Chinese phrase, enrichment returns pinyin, concise definition, synonyms, antonyms, sources, confidence, and polyphonic or meaning notes.
- If reliable antonyms are unavailable, `antonyms` is an empty array.
- The system does not invent antonyms.
- Confirmation creates a `whole_item` review state.

### Poem

- Given a poem title and optional author, enrichment returns standard title, author, dynasty, original text, line split, annotations, plain translation, sources, confidence, and version notes.
- The poem is stored as one study item.
- Each poem line receives an independent `whole_item` review state.

### Related Words

- Given a target character and original carrier text, enrichment returns 0 to 2 common related words.
- Every related word contains the target character.
- Related words require parent confirmation.
- Confirmed related words do not become official study items.

## Scheduling Tests

- First correct review schedules next review 1 day later.
- Second consecutive correct review schedules next review 3 days later.
- Third consecutive correct review schedules next review 7 days later.
- Fourth consecutive correct review schedules next review 15 days later.
- Fifth consecutive correct review schedules next review 30 days later.
- Sixth consecutive correct review schedules next review 60 days later and marks the state as mastered.
- Mastered maintenance review schedules the next review 60 days later.
- Incorrect review resets the current dimension's consecutive correct count to 0.
- Incorrect review schedules next long-term review for the next day.
- Incorrect review also adds a same-day retry before the current round ends.
- Same-day retry correct does not increase the long-term consecutive correct count.
- Missed or overdue content appears whenever `nextReviewDate <= today`.
- Dates are compared by local `YYYY-MM-DD`, not by time of day.

## Dimension Tests

- English spelling correct does not change English phonetic state.
- English phonetic correct does not change English spelling state.
- English spelling incorrect resets only spelling.
- English phonetic incorrect resets only phonetic.
- Chinese phrase whole-item incorrect can create character reinforcement for clicked wrong characters.
- Poem line incorrect affects only that line's review state, not other lines.
- Poem line wrong characters create reinforcement tied to that poem line.

## Wrong-Character Reinforcement Tests

- Clicking one or more wrong characters marks the original whole item incorrect.
- Each clicked character has an independent reinforcement state.
- The original carrier and confirmed related words rotate in reinforcement prompts.
- Reinforcement asks only whether the target character was written correctly.
- Correct target character reviews across 3 different dates complete reinforcement.
- Incorrect target character restarts reinforcement from the next day.
- Related words are capped at 2.
- Obscure related words are rejected or shown with low confidence for parent caution.

## Today Page Tests

- Today includes content confirmed today.
- Today includes all active review states where `nextReviewDate <= today`.
- Today excludes archived content.
- Today includes same-day retries before the session is completed.
- Today does not penalize overdue items.

## Dictation Tests

- Parent can mark English spelling correct or incorrect.
- Parent can mark English phonetic correct or incorrect.
- Parent can mark Chinese phrase correct or incorrect.
- Parent can click wrong Chinese characters.
- Parent can mark poem line correct or incorrect.
- Parent can click wrong characters in poem lines.
- Attempts are recorded with date, dimension, result, and retry flag.

## Library Tests

- Library shows confirmed study items and their review states.
- Library can show English enrichment fields.
- Library can show Chinese enrichment fields.
- Library can show poem text and split lines.
- Archived items stop appearing in Today.
- Existing usable items are not deleted by unrelated actions.

## Backup And Restore Tests

- Backup exports IndexedDB learning data to a local JSON file.
- Restore imports a valid backup.
- Restore validates expected shape before replacing or merging data.
- Backup and restore do not require a separate main page.

