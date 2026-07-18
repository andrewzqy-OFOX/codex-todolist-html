import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createLocalId,
  fetchEnrichment,
  findDuplicates,
  saveConfirmedDraft,
  splitLines
} from "../public/js/add-content.js";
import { emptyDraft, isStaticFrontendLocation, normalizeEditedDraft } from "../public/js/add-content-ui.js";
import { addItem, getAllItems, getEnrichmentCacheByQuery, resetDatabaseForTests } from "../public/js/db.js";

function envelope(kind, data, overrides = {}) {
  return {
    success: true,
    data,
    confidence: overrides.confidence || "high",
    warnings: overrides.warnings || [],
    ambiguities: overrides.ambiguities || [],
    sources: overrides.sources || [
      {
        title: "source",
        publisher: "publisher",
        url: "https://example.com"
      }
    ],
    fetchedAt: "2026-07-18T00:00:00.000Z",
    originalQuery: overrides.originalQuery || kind
  };
}

const englishDraft = envelope("environment", {
  normalizedWord: "environment",
  ukPhonetic: "/env/",
  usPhonetic: "/env/",
  partsOfSpeech: ["noun"],
  meaningsZh: ["环境"],
  alternativeCandidates: []
});

const chineseDraft = envelope("踌躇", {
  normalizedTerm: "踌躇",
  pinyin: "chou chu",
  definition: "犹豫。",
  synonyms: ["犹豫"],
  antonyms: [],
  pronunciationCandidates: []
});

const poemDraft = envelope("送杜少府之任蜀州", {
  title: "送杜少府之任蜀州",
  alternativeTitle: "",
  author: "王勃",
  dynasty: "唐",
  fullText: "城阙辅三秦，风烟望五津。",
  lines: [
    { order: 1, text: "城阙辅三秦" },
    { order: 2, text: "风烟望五津" }
  ],
  annotations: [{ term: "城阙", explanation: "指长安。" }],
  translation: "长安由三秦护卫，远望蜀地风烟迷蒙。",
  candidates: [],
  versionWarnings: []
});

test.beforeEach(async () => {
  await resetDatabaseForTests();
});

test("fetchEnrichment caches successful query and reuses cache", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => englishDraft
    };
  };

  const first = await fetchEnrichment("english", { word: "Environment" }, { fetchImpl });
  const second = await fetchEnrichment("english", { word: "environment" }, { fetchImpl });
  const cache = await getEnrichmentCacheByQuery("english", "environment");

  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(calls, 1);
  assert.equal(cache.result.data.normalizedWord, "environment");
});

test("force refresh overwrites cache", async () => {
  let meaning = "环境";
  const fetchImpl = async () => ({
    ok: true,
    json: async () => envelope("environment", { ...englishDraft.data, meaningsZh: [meaning] })
  });

  await fetchEnrichment("english", { word: "environment" }, { fetchImpl });
  meaning = "自然环境";
  const refreshed = await fetchEnrichment("english", { word: "environment" }, { fetchImpl, forceRefresh: true });

  assert.equal(refreshed.fromCache, false);
  assert.deepEqual(refreshed.data.meaningsZh, ["自然环境"]);
});

test("unconfirmed fetched material does not enter formal library", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => englishDraft
  });

  await fetchEnrichment("english", { word: "environment" }, { fetchImpl });
  const items = await getAllItems(true);

  assert.equal(items.length, 0);
});

test("saves confirmed English and records metadata", async () => {
  const result = await saveConfirmedDraft("english", {
    ...englishDraft,
    originalQuery: "Environment"
  });
  const item = result.items[0];

  assert.equal(result.saved, true);
  assert.equal(item.type, "english_word");
  assert.equal(item.spellingTrack.nextReviewDate, item.createdDate);
  assert.equal(item.phoneticTrack.nextReviewDate, item.createdDate);
  assert.equal(item.payload.originalQuery, "Environment");
  assert.equal(item.payload.confidence, "high");
  assert.equal(Array.isArray(item.payload.sourceRecords), true);
  assert.ok(item.payload.userConfirmedAt);
});

test("detects English duplicate ignoring case", async () => {
  await saveConfirmedDraft("english", englishDraft);
  const duplicate = await saveConfirmedDraft("english", {
    ...englishDraft,
    data: { ...englishDraft.data, normalizedWord: "Environment" }
  });

  assert.equal(duplicate.saved, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.duplicates.length, 1);
});

test("updates duplicate instead of creating another item", async () => {
  await saveConfirmedDraft("chinese", chineseDraft);
  const updatedDraft = {
    ...chineseDraft,
    data: {
      ...chineseDraft.data,
      definition: "拿不定主意。"
    }
  };
  const result = await saveConfirmedDraft("chinese", updatedDraft, { duplicateAction: "update" });
  const items = await getAllItems(true);

  assert.equal(result.saved, true);
  assert.equal(items.length, 1);
  assert.equal(result.items[0].payload.definition, "拿不定主意。");
});

test("saves poem as parent record and linked poem lines", async () => {
  const result = await saveConfirmedDraft("poem", poemDraft);
  const items = result.items;
  const parent = items.find((item) => item.type === "poem");
  const lines = items.filter((item) => item.type === "poem_line");

  assert.equal(items.length, 3);
  assert.equal(parent.text, "送杜少府之任蜀州");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].parentPoemId, parent.id);
  assert.equal(lines[0].lineIndex, 1);
  assert.equal(lines[0].title, "送杜少府之任蜀州");
  assert.equal(lines[0].author, "王勃");
  assert.equal(parent.payload.translation.includes("长安"), true);
});

test("detects same poem and repeated poem lines", async () => {
  await saveConfirmedDraft("poem", poemDraft);
  const duplicate = await saveConfirmedDraft("poem", poemDraft);
  const duplicates = findDuplicates(await getAllItems(true), "poem", poemDraft);

  assert.equal(duplicate.saved, false);
  assert.equal(duplicates.some((item) => item.type === "poem"), true);
  assert.equal(duplicates.some((item) => item.type === "poem_line"), true);
});

test("rejects repeated lines inside edited poem before saving", async () => {
  const draft = {
    ...poemDraft,
    data: {
      ...poemDraft.data,
      lines: [
        { order: 1, text: "城阙辅三秦" },
        { order: 2, text: "城阙辅三秦" }
      ]
    }
  };

  await assert.rejects(() => saveConfirmedDraft("poem", draft), /重复诗句/);
});

test("splitLines trims blank lines", () => {
  assert.deepEqual(splitLines("a\n\n b \r\nc"), ["a", "b", "c"]);
});

test("manual English JSON can be saved with empty optional fields", async () => {
  const draft = normalizeEditedDraft(
    "english",
    emptyDraft("english", "english"),
    JSON.stringify({
      normalizedWord: "english",
      ukPhonetic: "",
      usPhonetic: "",
      partsOfSpeech: [],
      meaningsZh: [],
      alternativeCandidates: []
    })
  );

  const result = await saveConfirmedDraft("english", draft);
  const [item] = await getAllItems(true);

  assert.equal(result.saved, true);
  assert.equal(item.text, "english");
  assert.deepEqual(item.payload.meaningsZh, []);
  assert.equal(item.payload.confidence, "low");
});

test("manual save can create ids when randomUUID is unavailable", async () => {
  const id = createLocalId("manual", {});

  assert.match(id, /^manual-\d+-[0-9a-f]+$/);
});

test("generated English fill card uses the simple editable JSON shape", () => {
  assert.deepEqual(emptyDraft("english", "hello").data, {
    normalizedWord: "hello",
    ukPhonetic: "",
    usPhonetic: "",
    partsOfSpeech: [],
    meaningsZh: [],
    alternativeCandidates: []
  });
});

test("static frontend location is detected for file and GitHub Pages", () => {
  assert.equal(isStaticFrontendLocation({ protocol: "file:", hostname: "" }), true);
  assert.equal(isStaticFrontendLocation({ protocol: "https:", hostname: "example.github.io" }), true);
  assert.equal(isStaticFrontendLocation({ protocol: "http:", hostname: "localhost" }), false);
});
