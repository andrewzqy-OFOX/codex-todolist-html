import {
  addItem,
  addItems,
  createDbLocalId,
  getAllItems,
  getEnrichmentCacheByQuery,
  saveEnrichmentCache,
  updateItem
} from "./db.js";
import { toLocalDate } from "./date-utils.js";
import { createChineseItem, createEnglishItem } from "./review-engine.js";

const ENDPOINTS = {
  english: "/api/enrich/english",
  chinese: "/api/enrich/chinese",
  poem: "/api/enrich/poem"
};

export function normalizeQuery(kind, input) {
  if (kind === "english") return input.word.trim().toLowerCase();
  if (kind === "chinese") return input.term.trim();
  if (kind === "poem") return `${input.title.trim()}|${(input.authorHint || "").trim()}`;
  throw new Error(`Unknown query kind: ${kind}`);
}

export function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function createLocalId(prefix = "item", cryptoLike = globalThis.crypto) {
  return createDbLocalId(prefix, cryptoLike);
}

export async function fetchEnrichment(kind, input, { forceRefresh = false, fetchImpl = fetch } = {}) {
  const normalizedQuery = normalizeQuery(kind, input);

  if (!forceRefresh) {
    const cached = await getEnrichmentCacheByQuery(kind, normalizedQuery);
    if (cached?.result) {
      return {
        ...cached.result,
        fromCache: true
      };
    }
  }

  const response = await fetchImpl(ENDPOINTS[kind], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || "查询失败，可先直接保存，之后再联网补全。");
  }

  await saveEnrichmentCache({
    queryType: kind,
    normalizedQuery,
    result: payload,
    status: "pending_parent_confirmation",
    fetchedAt: payload.fetchedAt
  });

  return {
    ...payload,
    fromCache: false
  };
}

function baseMetadata(kind, originalQuery, enrichment, now = new Date()) {
  return {
    sourceRecords: enrichment.sources || [],
    fetchedAt: enrichment.fetchedAt || now.toISOString(),
    userConfirmedAt: now.toISOString(),
    confidence: enrichment.confidence,
    warnings: enrichment.warnings || [],
    ambiguities: enrichment.ambiguities || [],
    originalQuery,
    queryType: kind,
    manuallyEntered: Boolean(enrichment.manuallyEntered)
  };
}

export function buildEnglishItemFromEnrichment(enrichment, originalQuery, today = toLocalDate()) {
  const word = enrichment.data.normalizedWord || originalQuery;
  const modelItem = createEnglishItem({
    id: createLocalId("english"),
    text: word,
    today
  });

  return {
    ...modelItem,
    payload: {
      ...enrichment.data,
      normalizedWord: word,
      ...baseMetadata("english", originalQuery, enrichment)
    }
  };
}

export function buildChineseItemFromEnrichment(enrichment, originalQuery, today = toLocalDate()) {
  const term = enrichment.data.normalizedTerm || originalQuery;
  const modelItem = createChineseItem({
    id: createLocalId("chinese"),
    text: term,
    today,
    type: "chinese_phrase"
  });

  return {
    ...modelItem,
    payload: {
      ...enrichment.data,
      normalizedTerm: term,
      ...baseMetadata("chinese", originalQuery, enrichment)
    }
  };
}

export function buildPoemItemsFromEnrichment(enrichment, originalQuery, today = toLocalDate()) {
  const data = enrichment.data;
  const parentPoemId = createLocalId("poem");
  const title = data.title || originalQuery;
  const lines = Array.isArray(data.lines) && data.lines.length
    ? data.lines
    : [{ order: 1, text: title }];

  const parent = {
    id: parentPoemId,
    type: "poem",
    text: title,
    status: "active",
    createdDate: today,
    nextReviewDate: today,
    parentId: null,
    reviewUnit: "reference",
    payload: {
      title,
      alternativeTitle: data.alternativeTitle || "",
      author: data.author || "",
      dynasty: data.dynasty || "",
      fullText: data.fullText || lines.map((line) => line.text).join("\n"),
      lines,
      annotations: data.annotations || [],
      translation: data.translation || "",
      candidates: data.candidates || [],
      versionWarnings: data.versionWarnings || [],
      ...baseMetadata("poem", originalQuery, enrichment)
    }
  };

  const lineItems = lines.map((line, index) => {
    const modelItem = createChineseItem({
      id: createLocalId("poem-line"),
      text: line.text,
      today,
      type: "poem_line"
    });

    return {
      ...modelItem,
      parentId: parentPoemId,
      parentPoemId,
      lineIndex: line.order || index + 1,
      title,
      author: data.author || "",
      payload: {
        parentPoemId,
        lineIndex: line.order || index + 1,
        title,
        author: data.author || "",
        dynasty: data.dynasty || "",
        ...baseMetadata("poem_line", originalQuery, enrichment)
      }
    };
  });

  return [parent, ...lineItems];
}

export function enrichmentKindForItem(item) {
  if (item.type === "english_word") return "english";
  if (item.type === "chinese_phrase") return "chinese";
  if (item.type === "poem") return "poem";
  return null;
}

export function enrichmentInputForItem(item) {
  const kind = enrichmentKindForItem(item);
  if (kind === "english") return { word: item.text };
  if (kind === "chinese") return { term: item.text };
  if (kind === "poem") {
    return {
      title: item.payload?.title || item.text,
      authorHint: item.payload?.author || ""
    };
  }
  return null;
}

export function canEnrichExistingItem(item) {
  return Boolean(enrichmentKindForItem(item));
}

export async function enrichExistingItem(item) {
  const kind = enrichmentKindForItem(item);
  const input = enrichmentInputForItem(item);
  if (!kind || !input) {
    throw new Error("这条内容暂不支持联网补全。");
  }

  const draft = await fetchEnrichment(kind, input, { forceRefresh: true });
  const text = kind === "english"
    ? draft.data.normalizedWord
    : kind === "chinese"
      ? draft.data.normalizedTerm
      : draft.data.title;

  return updateItem(item.id, {
    text,
    payload: {
      ...(item.payload || {}),
      ...draft.data,
      ...baseMetadata(kind, item.payload?.originalQuery || item.text, draft)
    }
  });
}

export function findDuplicates(items, kind, draft) {
  const activeItems = items.filter((item) => item.status !== "archived");

  if (kind === "english") {
    const normalized = draft.data.normalizedWord.trim().toLowerCase();
    return activeItems.filter((item) => {
      if (item.type !== "english_word") return false;
      const text = String(item.text || "").trim().toLowerCase();
      const payloadWord = String(item.payload?.normalizedWord || "").trim().toLowerCase();
      return text === normalized || payloadWord === normalized;
    });
  }

  if (kind === "chinese") {
    const normalized = draft.data.normalizedTerm.trim();
    return activeItems.filter((item) => item.type === "chinese_phrase" && (item.text === normalized || item.payload?.normalizedTerm === normalized));
  }

  if (kind === "poem") {
    const title = draft.data.title.trim();
    const author = String(draft.data.author || "").trim();
    const lineTexts = (draft.data.lines || []).map((line) => line.text.trim());
    const duplicatePoems = activeItems.filter((item) => {
      if (item.type !== "poem") return false;
      const existingTitle = String(item.payload?.title || item.text || "").trim();
      const existingAuthor = String(item.payload?.author || "").trim();
      return existingTitle === title && (!author || !existingAuthor || existingAuthor === author);
    });
    const duplicateLines = activeItems.filter((item) => item.type === "poem_line" && lineTexts.includes(String(item.text || "").trim()));
    return [...duplicatePoems, ...duplicateLines];
  }

  return [];
}

export async function saveConfirmedDraft(kind, draft, { duplicateAction = "create", duplicateItemId = null } = {}) {
  const existingItems = await getAllItems(true);
  const duplicates = findDuplicates(existingItems, kind, draft);

  if (duplicates.length && duplicateAction === "create") {
    return {
      saved: false,
      duplicate: true,
      duplicates
    };
  }

  if (duplicateAction === "update") {
    const target = duplicates.find((item) => item.id === duplicateItemId) || duplicates[0];
    if (!target) {
      throw new Error("没有可更新的重复内容。");
    }
    const updated = await updateItem(target.id, {
      text: kind === "english" ? draft.data.normalizedWord : kind === "chinese" ? draft.data.normalizedTerm : draft.data.title,
      payload: {
        ...target.payload,
        ...draft.data,
        ...baseMetadata(kind, draft.originalQuery, draft)
      }
    });
    return { saved: true, duplicate: true, items: [updated] };
  }

  if (kind === "english") {
    const item = await addItem(buildEnglishItemFromEnrichment(draft, draft.originalQuery));
    return { saved: true, duplicate: false, items: [item] };
  }

  if (kind === "chinese") {
    const item = await addItem(buildChineseItemFromEnrichment(draft, draft.originalQuery));
    return { saved: true, duplicate: false, items: [item] };
  }

  if (kind === "poem") {
    const built = buildPoemItemsFromEnrichment(draft, draft.originalQuery);
    const repeatedLines = new Set();
    const seen = new Set();
    for (const item of built.filter((entry) => entry.type === "poem_line")) {
      if (seen.has(item.text)) repeatedLines.add(item.text);
      seen.add(item.text);
    }
    if (repeatedLines.size) {
      throw new Error(`分句结果包含重复诗句：${[...repeatedLines].join("、")}`);
    }
    const items = await addItems(built);
    return { saved: true, duplicate: false, items };
  }

  throw new Error(`Unknown save kind: ${kind}`);
}
