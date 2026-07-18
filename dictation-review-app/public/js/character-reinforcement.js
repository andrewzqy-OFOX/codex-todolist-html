import { getEnrichmentCacheByQuery, saveEnrichmentCache } from "./db.js";

export function normalizeCharacterQuery(character, originalText) {
  return `${String(character || "").trim()}|${String(originalText || "").trim()}`;
}

export function sanitizeRelatedWords(character, originalText, words = []) {
  const target = String(character || "").trim();
  const original = String(originalText || "").trim();
  const seen = new Set();
  const result = [];

  for (const entry of words || []) {
    const word = String(entry?.word || "").trim();
    if (!target || !word || !word.includes(target) || word === original || seen.has(word)) continue;
    seen.add(word);
    result.push({
      word,
      pinyin: String(entry?.pinyin || "").trim(),
      definition: String(entry?.definition || "").trim(),
      recommendationReason: String(entry?.recommendationReason || entry?.reason || "").trim(),
      sources: Array.isArray(entry?.sources) ? entry.sources : [],
      confidence: entry?.confidence || "low",
      confirmed: true,
      manual: Boolean(entry?.manual)
    });
    if (result.length >= 2) break;
  }

  return result;
}

export function makeManualRelatedWord(character, input) {
  const word = String(input?.word || "").trim();
  return sanitizeRelatedWords(character, "", [{
    word,
    pinyin: input?.pinyin || "",
    definition: input?.definition || "",
    recommendationReason: "家长手动添加",
    sources: [],
    confidence: "low",
    manual: true
  }])[0] || null;
}

export async function fetchCharacterRecommendations(character, originalText, { forceRefresh = false, fetchImpl = fetch } = {}) {
  const normalizedQuery = normalizeCharacterQuery(character, originalText);

  if (!forceRefresh) {
    const cached = await getEnrichmentCacheByQuery("character", normalizedQuery);
    if (cached?.result) {
      return {
        ...cached.result,
        data: {
          ...cached.result.data,
          relatedWords: sanitizeRelatedWords(character, originalText, cached.result.data?.relatedWords)
        },
        fromCache: true
      };
    }
  }

  const response = await fetchImpl("/api/enrich/character", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ character, originalText })
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || "关联词查询失败，可不选关联词继续复习。");
  }

  const normalizedPayload = {
    ...payload,
    data: {
      ...payload.data,
      relatedWords: sanitizeRelatedWords(character, originalText, payload.data?.relatedWords)
    }
  };

  await saveEnrichmentCache({
    queryType: "character",
    normalizedQuery,
    result: normalizedPayload,
    status: "pending_parent_confirmation",
    fetchedAt: normalizedPayload.fetchedAt
  });

  return {
    ...normalizedPayload,
    fromCache: false
  };
}

export async function safeFetchCharacterRecommendations(character, originalText, options = {}) {
  try {
    const result = await fetchCharacterRecommendations(character, originalText, options);
    return {
      success: true,
      result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      result: {
        success: true,
        data: {
          character,
          relatedWords: []
        },
        confidence: "low",
        warnings: [error.message],
        ambiguities: [],
        sources: [],
        fetchedAt: new Date().toISOString(),
        fromCache: false
      }
    };
  }
}
