# Agent Instructions

我是红豆爱吃绿豆。

This repository is for a junior-middle-school dictation and memory review web app. Future development rounds must follow these rules.

## Required Reading Before Any Work

Before making code, documentation, test, or configuration changes, read these files in full:

- `PROJECT_SPEC.md`
- `DATA_MODEL.md`
- `API_CONTRACT.md`
- `IMPLEMENTATION_PLAN.md`
- `ACCEPTANCE_TESTS.md`
- `PROGRESS.md`
- `AGENTS.md`

## Scope Control

- Do not expand the product beyond the fixed scope in `PROJECT_SPEC.md`.
- Do not add accounts, leaderboards, complex analytics, OCR, automatic grading, cloud sync, social features, database servers, React, Vue, or complex build frameworks.
- Do not add new main pages beyond Today, Add Content, Dictation, and Library.
- Backup, restore, and simple settings may live in modals only.
- Do not delete existing working functionality unless the user explicitly requests it and the replacement is already verified.

## Development Rules

- Use native HTML, CSS, and JavaScript.
- Use Node.js and Express for the backend.
- Store all learning data in browser IndexedDB.
- Store the OpenAI API key only in backend `.env`.
- Use the official OpenAI JavaScript SDK, Responses API, `web_search`, Structured Outputs, and Zod validation for enrichment endpoints.
- Use local dates in `YYYY-MM-DD` format for review scheduling. Do not use hours or minutes to decide whether content is due.
- Keep implementation simple and readable for a small family-use application.

## Testing and Progress

- Run tests after each completed implementation step.
- Add or update focused tests for every behavior change.
- Update `PROGRESS.md` after each completed step.
- If tests cannot be run, record the reason in `PROGRESS.md` and in the final response.
- Stop after the requested task is complete. Do not automatically continue into the next development phase.

