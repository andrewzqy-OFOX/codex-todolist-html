# Project Specification

## Product Name

Junior Dictation Review App, Chinese working name: 初中生听写与记忆复习程序.

## Product Goal

A minimal web app for parents to run paper-and-pencil dictation practice for junior-middle-school students. The app helps parents add study items, verify AI-enriched learning material, generate daily new and review tasks, record dictation outcomes, and schedule future reviews using fixed memory intervals.

The app is not an automatic grading product. The parent observes the paper result and records correct or incorrect outcomes manually.

## Strict Product Scope

The app solves only these problems:

- Minimal entry of English words, Chinese words or phrases, and classical poem titles.
- Online enrichment from reliable sources.
- Parent confirmation before enriched material enters the learning library.
- Daily generation of content newly confirmed today and content whose review date is due or overdue.
- Parent recording of correct or incorrect paper dictation results.
- Fixed review scheduling by memory cycle.
- Separate English tracking for spelling and phonetic errors.
- Clickable wrong characters for Chinese words, phrases, and poem lines.
- Character reinforcement using other common words that include the wrong character.

## Explicit Non-Goals

Do not implement accounts, leaderboards, complex reports, OCR, automatic handwriting recognition, automatic grading, cloud sync, social features, database server storage, React, Vue, complex frontend build frameworks, or extra main pages.

## Fixed Technology Stack

- Native HTML
- Native CSS
- Native JavaScript
- Node.js
- Express
- Browser IndexedDB as the full learning-data store
- Official OpenAI JavaScript SDK on the backend only
- Responses API
- `web_search` tool for online enrichment
- Structured Outputs returning fixed JSON
- Zod validation on backend responses before returning data to the browser
- Node built-in test runner or another very lightweight test tool

API keys must be stored only in backend `.env` and must never appear in browser code or IndexedDB.

## Fixed Main Pages

Only four main pages are allowed:

1. Today
2. Add Content
3. Dictation
4. Library

Backup, restore, and simple settings may be implemented as modals or panels. They must not become independent main pages.

## Supported Content Types

### English Word

The parent enters only an English word. Enrichment returns standard spelling, British phonetic transcription, American phonetic transcription, common parts of speech, 1 to 3 junior-middle-school-level Chinese meanings, sources, confidence, and ambiguity notes.

English has two independent review dimensions: `spelling` and `phonetic`.

### Chinese Word Or Phrase

The parent enters only a Chinese word or phrase. Enrichment returns pinyin, concise definition, common synonyms, common antonyms, sources, confidence, and polyphonic or multiple-meaning notes.

If no reliable antonym exists, enrichment must return an empty array. It must not invent antonyms.

Chinese words and phrases have `whole_item` and `character` review dimensions.

### Classical Poem

The parent enters a poem title and may optionally enter the author. Enrichment returns standard title, author, dynasty, full original text, line-split result, key word annotations, concise plain-language translation suitable for junior-middle-school students, sources, confidence, and same-title or version-difference notes.

Poem material is stored as the whole poem, but review scheduling happens by line. Each line is independently reviewed.

### Wrong-Character Related Words

For a clicked wrong Chinese character, enrichment receives the target character and the original word, phrase, or poem line. It returns up to 2 common related words containing the target character, pinyin, concise definition, recommendation reason, sources, and confidence.

The system must not recommend obscure words just to fill the quota.

## Review Rules

All review dates use local date strings in `YYYY-MM-DD`. Hours, minutes, time zones, and timestamps must not decide whether an item is due.

| Consecutive Correct Count | Next Review |
| --- | --- |
| 1 | 1 day later |
| 2 | 3 days later |
| 3 | 7 days later |
| 4 | 15 days later |
| 5 | 30 days later |
| 6 | 60 days later and mark as mastered |

Mastered content continues maintenance review every 60 days.

When a dimension is marked incorrect:

- current consecutive correct count for that dimension resets to 0
- next long-term review is scheduled for the next day
- the item appears again before the current day's full round ends
- correcting the same-day retry does not increase the long-term consecutive correct count

Missed or overdue work is not penalized. Any item with `nextReviewDate <= today` appears in today's task list.

## Wrong-Character Reinforcement

When a Chinese word, phrase, or poem line has individual wrong characters:

- The parent clicks one or more wrong characters.
- The original word, phrase, or poem line is marked incorrect as a whole item and scheduled for next-day review.
- Each clicked character receives its own reinforcement state.
- The system recommends at most 2 junior-middle-school-common related words containing that character.
- The parent must confirm recommended words.
- Related words are reinforcement carriers only. They do not automatically become official library items.
- The original item and confirmed related words rotate in future reinforcement prompts.
- Only the target character is judged correct or incorrect.
- After 3 correct reviews across dates, that target character exits reinforcement.
- If the target character is wrong again, reinforcement restarts from the next day.

## Reliability Principles For Enrichment

- Prefer official, educational, dictionary, textbook-aligned, or otherwise reputable sources.
- Return source URLs or source names for parent inspection.
- Distinguish low confidence, ambiguity, same-title, version, polyphonic, and multi-meaning cases.
- Do not fabricate missing fields. Use empty arrays or notes where appropriate.
- Keep translations and annotations concise and suitable for junior-middle-school understanding.
- Do not copy long text from a single web page for translations or annotations.

## Implementation Boundary For This Round

This round creates project specifications and planning documents only. It must not implement complete business functionality.

