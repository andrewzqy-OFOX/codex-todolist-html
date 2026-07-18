# Data Model

All learning data is stored in browser IndexedDB. The backend is stateless except for reading `.env` and calling OpenAI enrichment endpoints.

## IndexedDB

Database name: `junior-dictation-review`

Initial schema version: `1`

Recommended object stores:

- `studyItems`
- `reviewStates`
- `dictationSessions`
- `dictationAttempts`
- `characterReinforcements`
- `pendingEnrichments`
- `settings`
- `backupMetadata`

IDs should be generated in the browser with `crypto.randomUUID()`.

Dates are local date strings in `YYYY-MM-DD`.

## Shared Types

```ts
type LocalDate = string; // YYYY-MM-DD
type ISODateTime = string; // for audit timestamps only, not due-date logic

type ItemType = "english_word" | "chinese_phrase" | "poem";
type EnglishDimension = "spelling" | "phonetic";
type ChineseDimension = "whole_item" | "character";
type ReviewDimension = EnglishDimension | ChineseDimension;
type ReviewStatus = "learning" | "mastered" | "reinforcing" | "archived";
type ReviewResult = "correct" | "incorrect";
```

## `studyItems`

Stores parent-confirmed official learning material.

```ts
interface StudyItem {
  id: string;
  type: ItemType;
  createdDate: LocalDate;
  updatedAt: ISODateTime;
  sourceInput: {
    text: string;
    author?: string;
  };
  displayText: string;
  status: "active" | "archived";
  enrichment: EnglishEnrichment | ChinesePhraseEnrichment | PoemEnrichment;
}
```

## Enrichment Types

```ts
interface EnglishEnrichment {
  standardSpelling: string;
  britishPhonetic: string;
  americanPhonetic: string;
  partsOfSpeech: string[];
  chineseMeanings: string[]; // 1 to 3 items
  sources: SourceRef[];
  confidence: "high" | "medium" | "low";
  ambiguityNotes: string[];
}

interface ChinesePhraseEnrichment {
  pinyin: string;
  definition: string;
  synonyms: string[];
  antonyms: string[]; // empty when no reliable antonym exists
  sources: SourceRef[];
  confidence: "high" | "medium" | "low";
  polyphoneOrMeaningNotes: string[];
}

interface PoemEnrichment {
  standardTitle: string;
  author: string;
  dynasty: string;
  originalText: string;
  lines: PoemLine[];
  annotations: Annotation[];
  plainTranslation: string;
  sources: SourceRef[];
  confidence: "high" | "medium" | "low";
  versionNotes: string[];
}

interface PoemLine {
  lineId: string;
  order: number;
  text: string;
}

interface Annotation {
  term: string;
  explanation: string;
}

interface SourceRef {
  title: string;
  url?: string;
  publisher?: string;
}
```

## `reviewStates`

Stores independent long-term scheduling state.

For English, one item has two states: `spelling` and `phonetic`. For Chinese phrases, one item has one `whole_item` state. Character reinforcement lives in `characterReinforcements`. For poems, each poem line has one `whole_item` state.

```ts
interface ReviewState {
  id: string;
  itemId: string;
  itemType: ItemType;
  dimension: "spelling" | "phonetic" | "whole_item";
  poemLineId?: string;
  consecutiveCorrect: number; // 0 to 6 for long-term schedule
  status: "learning" | "mastered";
  nextReviewDate: LocalDate;
  lastReviewedDate?: LocalDate;
  createdDate: LocalDate;
  updatedAt: ISODateTime;
}
```

## `dictationSessions`

```ts
interface DictationSession {
  id: string;
  sessionDate: LocalDate;
  status: "in_progress" | "completed";
  taskIds: string[];
  retryQueueTaskIds: string[];
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
}
```

## `dictationAttempts`

```ts
interface DictationAttempt {
  id: string;
  sessionId: string;
  itemId: string;
  reviewStateId?: string;
  characterReinforcementId?: string;
  poemLineId?: string;
  dimension: "spelling" | "phonetic" | "whole_item" | "character";
  targetText: string;
  carrierText?: string;
  result: ReviewResult;
  isSameDayRetry: boolean;
  wrongCharacters: WrongCharacterMark[];
  attemptDate: LocalDate;
  createdAt: ISODateTime;
}

interface WrongCharacterMark {
  char: string;
  index: number;
}
```

## `characterReinforcements`

```ts
interface CharacterReinforcement {
  id: string;
  itemId: string;
  itemType: "chinese_phrase" | "poem";
  poemLineId?: string;
  targetCharacter: string;
  originalCarrierText: string;
  confirmedRelatedWords: RelatedWord[];
  consecutiveCorrectAcrossDates: number; // exits after 3
  nextReviewDate: LocalDate;
  status: "pending_related_words" | "active" | "completed";
  lastReviewedDate?: LocalDate;
  createdDate: LocalDate;
  updatedAt: ISODateTime;
}

interface RelatedWord {
  word: string;
  pinyin: string;
  definition: string;
  reason: string;
  sources: SourceRef[];
  confidence: "high" | "medium" | "low";
  confirmed: boolean;
}
```

## `pendingEnrichments`

Stores draft enrichment results before parent confirmation. These are not official study items.

```ts
interface PendingEnrichment {
  id: string;
  type: ItemType | "related_words";
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  status: "pending_parent_confirmation" | "confirmed" | "discarded";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

## `settings`

```ts
interface Settings {
  id: "main";
  dailyNewItemsLimit?: number;
  showBritishPhoneticFirst: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

## Scheduling Functions

Implementation should isolate pure scheduling logic so it can be tested without the DOM or IndexedDB.

```ts
function nextDateAfterCorrect(today: LocalDate, consecutiveCorrectAfterIncrement: number, mastered: boolean): LocalDate;
function nextDateAfterIncorrect(today: LocalDate): LocalDate; // today + 1 day
function isDue(nextReviewDate: LocalDate, today: LocalDate): boolean; // string date comparison after validation
```

Correct intervals:

- 1 -> +1 day
- 2 -> +3 days
- 3 -> +7 days
- 4 -> +15 days
- 5 -> +30 days
- 6 -> +60 days and mastered
- mastered maintenance -> +60 days

Same-day retries must not increment long-term `consecutiveCorrect`.

