import test from "node:test";
import assert from "node:assert/strict";

import { createApp, createRateLimiter } from "../server/server.js";
import { enrich } from "../server/enrichment/enrichment-service.js";

function makeEnvelope(data, overrides = {}) {
  return {
    success: true,
    data,
    confidence: overrides.confidence || "high",
    warnings: overrides.warnings || [],
    ambiguities: overrides.ambiguities || [],
    sources: overrides.sources ?? [
      {
        title: "Reliable source",
        publisher: "Publisher",
        url: "https://example.com/source"
      }
    ],
    fetchedAt: "2026-07-18T00:00:00.000Z"
  };
}

const englishData = {
  normalizedWord: "environment",
  ukPhonetic: "/ɪnˈvaɪrənmənt/",
  usPhonetic: "/ɪnˈvaɪrənmənt/",
  partsOfSpeech: ["noun"],
  meaningsZh: ["环境"],
  alternativeCandidates: []
};

const chineseData = {
  normalizedTerm: "踌躇",
  pinyin: "chou chu",
  definition: "犹豫，拿不定主意。",
  synonyms: ["犹豫"],
  antonyms: [],
  pronunciationCandidates: []
};

const poemData = {
  title: "送杜少府之任蜀州",
  alternativeTitle: "",
  author: "王勃",
  dynasty: "唐",
  fullText: "城阙辅三秦，风烟望五津。与君离别意，同是宦游人。",
  lines: [
    { order: 1, text: "城阙辅三秦" },
    { order: 2, text: "风烟望五津" }
  ],
  annotations: [{ term: "城阙", explanation: "指长安。" }],
  translation: "三秦大地护卫着长安，远望蜀地只见风烟迷蒙。",
  candidates: [],
  versionWarnings: []
};

const characterData = {
  character: "涯",
  pinyin: "ya",
  relatedWords: [
    {
      word: "天涯",
      pinyin: "tian ya",
      definition: "很远的地方。"
    }
  ],
  recommendationReason: "包含目标字，常见且适合强化。"
};

function mockClientReturning(payload, onCreate = () => {}) {
  return {
    responses: {
      create: async (requestPayload, requestOptions) => {
        onCreate(requestPayload, requestOptions);
        return {
          status: "completed",
          output_text: JSON.stringify(payload)
        };
      }
    }
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function postJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  return { response, json };
}

test("health endpoint reports backend enrichment phase without secrets", async () => {
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning(makeEnvelope(englishData)),
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.openaiConfigured, true);
    assert.equal(JSON.stringify(json).includes("test-key"), false);
  });
});

test("English enrichment returns normal structure and uses Responses settings", async () => {
  let capturedPayload;
  let capturedOptions;
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning(makeEnvelope(englishData), (payload, options) => {
      capturedPayload = payload;
      capturedOptions = options;
    }),
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/english", { word: "environment" });

    assert.equal(response.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.normalizedWord, "environment");
    assert.equal(json.sources.length, 1);
    assert.equal(capturedPayload.model, "test-model");
    assert.equal(capturedPayload.store, false);
    assert.deepEqual(capturedPayload.tools, [{ type: "web_search" }]);
    assert.equal(capturedPayload.text.format.type, "json_schema");
    assert.ok(capturedOptions.signal);
  });
});

test("request validation rejects bad input before model call", async () => {
  let called = false;
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning(makeEnvelope(englishData), () => {
      called = true;
    }),
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/english", { word: "" });

    assert.equal(response.status, 400);
    assert.equal(json.success, false);
    assert.equal(json.error.code, "BAD_REQUEST");
    assert.equal(called, false);
  });
});

test("model response missing required fields is rejected", async () => {
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning({
      success: true,
      data: {},
      confidence: "high",
      warnings: [],
      ambiguities: [],
      sources: [],
      fetchedAt: "2026-07-18T00:00:00.000Z"
    }),
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/english", { word: "environment" });

    assert.equal(response.status, 502);
    assert.equal(json.error.code, "VALIDATION_FAILED");
  });
});

test("empty sources are accepted as explicit low-confidence output", async () => {
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning(makeEnvelope(englishData, {
      confidence: "low",
      warnings: ["没有找到足够可靠的来源。"],
      sources: []
    })),
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/english", { word: "environment" });

    assert.equal(response.status, 200);
    assert.equal(json.confidence, "low");
    assert.deepEqual(json.sources, []);
    assert.equal(json.warnings.length, 1);
  });
});

test("Chinese endpoint preserves no-antonym result", async () => {
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning(makeEnvelope(chineseData)),
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/chinese", { term: "踌躇" });

    assert.equal(response.status, 200);
    assert.deepEqual(json.data.antonyms, []);
  });
});

test("Poem endpoint can return same-title candidates and version warnings", async () => {
  const data = {
    ...poemData,
    candidates: [
      {
        title: "同名作品",
        author: "作者甲",
        dynasty: "唐",
        reason: "搜索结果存在同名。"
      }
    ],
    versionWarnings: ["不同来源断句略有差异。"]
  };
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning(makeEnvelope(data, { ambiguities: ["存在同名作品。"] })),
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/poem", { title: "送别", authorHint: "" });

    assert.equal(response.status, 200);
    assert.equal(json.data.candidates.length, 1);
    assert.equal(json.data.versionWarnings.length, 1);
    assert.equal(json.ambiguities.length, 1);
  });
});

test("Character endpoint validates related word shape", async () => {
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning(makeEnvelope(characterData)),
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/character", {
      character: "涯",
      originalText: "天涯若比邻"
    });

    assert.equal(response.status, 200);
    assert.equal(json.data.relatedWords[0].word.includes("涯"), true);
  });
});

test("network error returns safe error", async () => {
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: {
      responses: {
        create: async () => {
          throw new Error("network includes no secret");
        }
      }
    },
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/english", { word: "environment" });

    assert.equal(response.status, 502);
    assert.equal(json.error.code, "OPENAI_REQUEST_FAILED");
    assert.equal(JSON.stringify(json).includes("test-key"), false);
  });
});

test("timeout returns clear error", async () => {
  const client = {
    responses: {
      create: (_payload, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    }
  };

  await assert.rejects(
    () =>
      enrich("english", { word: "environment" }, {
        env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model", OPENAI_TIMEOUT_MS: "1" },
        openaiClient: client
      }),
    (error) => error.body.error.code === "NETWORK_TIMEOUT"
  );
});

test("missing API key returns safe server error", async () => {
  const app = createApp({
    env: {},
    openaiClient: null,
    rateLimiter: (_req, _res, next) => next()
  });

  await withServer(app, async (baseUrl) => {
    const { response, json } = await postJson(baseUrl, "/api/enrich/english", { word: "environment" });

    assert.equal(response.status, 500);
    assert.equal(json.error.code, "MISSING_API_KEY");
    assert.equal(JSON.stringify(json).includes("OPENAI_API_KEY="), false);
  });
});

test("rate limiter rejects requests that are too frequent", async () => {
  const app = createApp({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    openaiClient: mockClientReturning(makeEnvelope(englishData)),
    rateLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1 })
  });

  await withServer(app, async (baseUrl) => {
    const first = await postJson(baseUrl, "/api/enrich/english", { word: "environment" });
    const second = await postJson(baseUrl, "/api/enrich/english", { word: "environment" });

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 429);
    assert.equal(second.json.error.code, "RATE_LIMITED");
  });
});

