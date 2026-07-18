# API Contract

The backend exists only to protect the OpenAI API key and normalize online enrichment results. It must not store learning data.

## Backend Stack

- Node.js
- Express
- Official OpenAI JavaScript SDK
- Responses API
- `web_search`
- Structured Outputs
- Zod validation
- `.env` for `OPENAI_API_KEY`

## Common Rules

- Request and response bodies are JSON.
- All enrichment endpoints return validated JSON only.
- The backend validates OpenAI output with Zod before returning it to the browser.
- If validation fails, the backend returns a safe error and does not pass malformed data through.
- The browser stores returned draft results as `pendingEnrichments` until the parent confirms them.
- Sources should include URLs where available.
- Confidence is one of `high`, `medium`, or `low`.

## Error Shape

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The enrichment result did not match the expected schema.",
    "details": []
  }
}
```

Suggested error codes: `BAD_REQUEST`, `OPENAI_REQUEST_FAILED`, `VALIDATION_FAILED`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## `POST /api/enrich/english`

Request:

```json
{
  "word": "example"
}
```

Response:

```json
{
  "standardSpelling": "example",
  "britishPhonetic": "/ɪɡˈzɑːmpəl/",
  "americanPhonetic": "/ɪɡˈzæmpəl/",
  "partsOfSpeech": ["noun"],
  "chineseMeanings": ["例子", "榜样"],
  "sources": [
    {
      "title": "Dictionary source",
      "url": "https://example.com",
      "publisher": "Publisher"
    }
  ],
  "confidence": "high",
  "ambiguityNotes": []
}
```

Constraints:

- `word` must be a non-empty English word or simple hyphenated word.
- `chineseMeanings` must contain 1 to 3 junior-middle-school-common meanings.
- Do not return long example sections.

## `POST /api/enrich/chinese-phrase`

Request:

```json
{
  "phrase": "坚持"
}
```

Response:

```json
{
  "pinyin": "jian chi",
  "definition": "长时间努力做一件事，不轻易放弃。",
  "synonyms": ["维持", "保持"],
  "antonyms": ["放弃"],
  "sources": [
    {
      "title": "Dictionary source",
      "url": "https://example.com",
      "publisher": "Publisher"
    }
  ],
  "confidence": "high",
  "polyphoneOrMeaningNotes": []
}
```

Constraints:

- `phrase` must be non-empty Chinese text.
- `antonyms` must be an empty array if no reliable antonym exists.
- Do not invent antonyms.

## `POST /api/enrich/poem`

Request:

```json
{
  "title": "静夜思",
  "author": "李白"
}
```

`author` is optional.

Response:

```json
{
  "standardTitle": "静夜思",
  "author": "李白",
  "dynasty": "唐",
  "originalText": "床前明月光，疑是地上霜。举头望明月，低头思故乡。",
  "lines": [
    {
      "lineId": "line-1",
      "order": 1,
      "text": "床前明月光"
    }
  ],
  "annotations": [
    {
      "term": "疑",
      "explanation": "好像，似乎。"
    }
  ],
  "plainTranslation": "明亮的月光洒在床前，好像地上有一层霜。我抬头望着明月，低头思念家乡。",
  "sources": [
    {
      "title": "Educational source",
      "url": "https://example.com",
      "publisher": "Publisher"
    }
  ],
  "confidence": "high",
  "versionNotes": []
}
```

Constraints:

- Return the whole poem, but split reviewable lines.
- Translation and annotations must be concise and rewritten for junior-middle-school comprehension.
- Mention same-title works or version differences when relevant.

## `POST /api/enrich/related-words`

Request:

```json
{
  "targetCharacter": "霜",
  "originalCarrierText": "疑是地上霜"
}
```

Response:

```json
{
  "targetCharacter": "霜",
  "relatedWords": [
    {
      "word": "霜冻",
      "pinyin": "shuang dong",
      "definition": "接近地面的温度降到零度以下，使植物受冻的现象。",
      "reason": "包含目标字“霜”，含义常见，适合作为强化练习。",
      "sources": [
        {
          "title": "Dictionary source",
          "url": "https://example.com",
          "publisher": "Publisher"
        }
      ],
      "confidence": "high"
    }
  ]
}
```

Constraints:

- Return 0 to 2 related words.
- Related words must contain `targetCharacter`.
- Related words should be common for junior-middle-school students.
- Do not recommend obscure words to fill the count.
- The parent must confirm recommendations before use.

## Structured Output Schemas

Implementation should keep Zod schemas and OpenAI JSON schemas aligned. Recommended source of truth: define Zod schemas first, then derive or manually mirror JSON schema constants in the backend.

Minimum Zod files when implementation begins:

- `server/schemas/common.js`
- `server/schemas/english.js`
- `server/schemas/chinesePhrase.js`
- `server/schemas/poem.js`
- `server/schemas/relatedWords.js`

## Security

- `.env` must be ignored by git.
- Browser code must call only local backend endpoints.
- Browser code must never read or receive `OPENAI_API_KEY`.
- Backend logs must not print API keys or full raw OpenAI responses in normal operation.

