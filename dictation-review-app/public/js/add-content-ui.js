import { fetchEnrichment, saveConfirmedDraft, splitLines } from "./add-content.js";

const KIND_LABELS = {
  english: "英语单词",
  chinese: "中文词语",
  poem: "古诗词"
};

export function isStaticFrontendLocation(locationLike) {
  const protocol = locationLike?.protocol || "";
  const hostname = locationLike?.hostname || "";
  return protocol === "file:" || hostname.endsWith("github.io");
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function getInputs(kind) {
  if (kind === "english") {
    return splitLines(document.querySelector("#english-input").value).map((word) => ({
      kind,
      input: { word },
      originalQuery: word
    }));
  }

  if (kind === "chinese") {
    return splitLines(document.querySelector("#chinese-input").value).map((term) => ({
      kind,
      input: { term },
      originalQuery: term
    }));
  }

  const title = document.querySelector("#poem-title-input").value.trim();
  const authorHint = document.querySelector("#poem-author-input").value.trim();
  return title
    ? [{
        kind,
        input: { title, authorHint },
        originalQuery: authorHint ? `${title}（${authorHint}）` : title
      }]
    : [];
}

export function emptyDraft(kind, originalQuery) {
  const common = {
    success: true,
    confidence: "low",
    warnings: ["手动填写，未联网校验。以后可在学习库点击“联网补全”。"],
    ambiguities: [],
    sources: [],
    fetchedAt: new Date().toISOString(),
    originalQuery,
    fromCache: false,
    manuallyEntered: true
  };

  if (kind === "english") {
    return {
      ...common,
      data: {
        normalizedWord: originalQuery,
        ukPhonetic: "",
        usPhonetic: "",
        partsOfSpeech: [],
        meaningsZh: [],
        alternativeCandidates: []
      }
    };
  }

  if (kind === "chinese") {
    return {
      ...common,
      data: {
        normalizedTerm: originalQuery,
        pinyin: "",
        definition: "",
        synonyms: [],
        antonyms: [],
        pronunciationCandidates: []
      }
    };
  }

  return {
    ...common,
    data: {
      title: originalQuery,
      alternativeTitle: "",
      author: "",
      dynasty: "",
      fullText: originalQuery,
      lines: [{ order: 1, text: originalQuery }],
      annotations: [],
      translation: "",
      candidates: [],
      versionWarnings: []
    }
  };
}

export function normalizeEditedDraft(kind, parsedOrDraft, draftOrJson) {
  const legacyCall = typeof draftOrJson === "string";
  const originalDraft = legacyCall ? parsedOrDraft : draftOrJson;
  const parsed = legacyCall ? JSON.parse(draftOrJson) : parsedOrDraft;
  const draft = {
    ...originalDraft,
    data: parsed,
    originalQuery: originalDraft.originalQuery,
    sources: originalDraft.sources || [],
    warnings: originalDraft.warnings || [],
    ambiguities: originalDraft.ambiguities || []
  };

  if (kind === "english" && !draft.data.normalizedWord) {
    throw new Error("英语卡片需要 normalizedWord。");
  }
  if (kind === "chinese" && !draft.data.normalizedTerm) {
    throw new Error("中文卡片需要 normalizedTerm。");
  }
  if (kind === "poem") {
    if (!draft.data.title) throw new Error("古诗卡片需要 title。");
    if (!Array.isArray(draft.data.lines) || !draft.data.lines.length) {
      draft.data.lines = [{ order: 1, text: draft.data.fullText || draft.data.title }];
    }
    draft.data.lines = draft.data.lines.map((line, index) => ({
      order: line.order || index + 1,
      text: String(line.text || "").trim()
    })).filter((line) => line.text);
    if (!draft.data.lines.length) throw new Error("古诗至少需要一句可背默内容。");
  }

  return draft;
}

function renderSources(card, draft) {
  card.append(createElement("h4", null, "来源"));
  const sources = Array.isArray(draft.sources) ? draft.sources : [];
  if (!sources.length) {
    card.append(createElement("p", "muted", "暂无来源。"));
    return;
  }

  const list = createElement("ul");
  sources.forEach((source) => {
    const item = createElement("li");
    item.textContent = [source.title, source.publisher, source.url].filter(Boolean).join(" · ");
    list.append(item);
  });
  card.append(list);
}

function renderWarnings(card, draft) {
  const warnings = Array.isArray(draft.warnings) ? draft.warnings : [];
  if (!warnings.length) return;
  card.append(createElement("h4", null, "警告"));
  const list = createElement("ul");
  warnings.forEach((warning) => list.append(createElement("li", null, warning)));
  card.append(list);
}

function draftTitle(kind, draft) {
  if (kind === "english") return `英语单词：${draft.data.normalizedWord}`;
  if (kind === "chinese") return `中文词语：${draft.data.normalizedTerm}`;
  return `古诗词：${draft.data.title}`;
}

function renderDraft(container, kind, draft, onSaved, showToast) {
  const card = createElement("article", "result-card");

  const head = createElement("div", "result-card-head");
  head.append(createElement("h3", null, draftTitle(kind, draft)));
  head.append(createElement("span", "pill", `可信度：${draft.confidence || "low"}`));
  card.append(head);

  renderWarnings(card, draft);
  renderSources(card, draft);

  const editor = document.createElement("textarea");
  editor.className = "json-editor";
  editor.rows = 10;
  editor.spellcheck = false;
  editor.autocomplete = "off";
  editor.autocapitalize = "off";
  editor.value = JSON.stringify(draft.data, null, 2);
  card.append(editor);

  const actions = createElement("div", "form-actions");
  const saveButton = createElement("button", null, "确认并保存");
  const saveEditedButton = createElement("button", null, "修改后保存");
  const requeryButton = createElement("button", null, "重新联网查询");
  const cancelButton = createElement("button", null, "取消");

  async function save(shouldParseEditor) {
    try {
      const nextDraft = shouldParseEditor
        ? normalizeEditedDraft(kind, JSON.parse(editor.value), draft)
        : draft;
      const result = await saveConfirmedDraft(kind, nextDraft);
      if (result.duplicate) {
        showToast("学习库里已有相同内容，请到学习库查看或先归档旧内容。", true);
        return;
      }
      card.remove();
      showToast("已保存到学习库，今天会进入背默任务。");
      await onSaved();
    } catch (error) {
      showToast(error.message || "保存失败。", true);
    }
  }

  saveButton.addEventListener("click", () => save(false));
  saveEditedButton.addEventListener("click", () => save(true));
  requeryButton.addEventListener("click", async () => {
    try {
      requeryButton.disabled = true;
      const input = kind === "english"
        ? { word: draft.originalQuery }
        : kind === "chinese"
          ? { term: draft.originalQuery }
          : { title: draft.originalQuery, authorHint: "" };
      const nextDraft = await fetchEnrichment(kind, input, { forceRefresh: true });
      nextDraft.originalQuery = draft.originalQuery;
      card.replaceWith(renderDraft(container, kind, nextDraft, onSaved, showToast));
      showToast("联网资料已更新，请确认后保存。");
    } catch (error) {
      showToast(error.message || "重新查询失败。", true);
    } finally {
      requeryButton.disabled = false;
    }
  });
  cancelButton.addEventListener("click", () => card.remove());

  actions.append(saveButton, saveEditedButton, requeryButton, cancelButton);
  card.append(actions);
  container.append(card);
  return card;
}

async function saveMinimalInputs(inputs, onSaved, showToast) {
  let savedCount = 0;
  for (const entry of inputs) {
    const draft = emptyDraft(entry.kind, entry.originalQuery);
    const result = await saveConfirmedDraft(entry.kind, draft);
    if (result.duplicate) {
      showToast(`${entry.originalQuery} 已存在，未重复保存。`, true);
    } else {
      savedCount += 1;
    }
  }

  if (savedCount) {
    showToast(`已直接保存 ${savedCount} 条。联网资料可之后在学习库补全。`);
    await onSaved();
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".add-tab");
  const panels = document.querySelectorAll(".add-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const kind = tab.dataset.kind;
      tabs.forEach((item) => item.classList.toggle("active", item === tab));
      panels.forEach((panel) => panel.hidden = panel.dataset.kind !== kind);
    });
  });
}

export function setupAddContentPage({ onSaved, showToast }) {
  const form = document.querySelector("#add-content-form");
  const queryButton = document.querySelector("#query-button");
  const manualButton = document.querySelector("#manual-button");
  const status = document.querySelector("#query-status");
  const results = document.querySelector("#add-results");
  const staticMode = isStaticFrontendLocation(window.location);

  setupTabs();

  if (staticMode) {
    queryButton.textContent = "直接保存";
    manualButton.textContent = "生成填写卡";
    status.textContent = "静态版：点“直接保存”会把输入内容加入学习库；需要音标、释义和注释时，可之后在电脑联网版补全。";
  } else {
    queryButton.textContent = "联网查询";
    manualButton.textContent = "手动填写";
    status.textContent = "可联网查询资料，也可以先手动填写。";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const kind = document.querySelector(".add-tab.active")?.dataset.kind || "english";
    const inputs = getInputs(kind);
    if (!inputs.length) {
      showToast("请先输入内容。", true);
      return;
    }

    queryButton.disabled = true;
    manualButton.disabled = true;
    try {
      if (staticMode) {
        status.textContent = "正在直接保存到本浏览器...";
        await saveMinimalInputs(inputs, onSaved, showToast);
        status.textContent = "已保存。以后可在学习库点击“联网补全”。";
        return;
      }

      status.textContent = "正在联网查询...";
      for (const entry of inputs) {
        const draft = await fetchEnrichment(entry.kind, entry.input);
        draft.originalQuery = entry.originalQuery;
        renderDraft(results, entry.kind, draft, onSaved, showToast);
      }
      status.textContent = "查询成功。请确认后保存。";
    } catch (error) {
      status.textContent = "查询失败。可直接保存或生成填写卡。";
      showToast(error.message || "查询失败。", true);
    } finally {
      queryButton.disabled = false;
      manualButton.disabled = false;
    }
  });

  manualButton.addEventListener("click", () => {
    const kind = document.querySelector(".add-tab.active")?.dataset.kind || "english";
    const inputs = getInputs(kind);
    if (!inputs.length) {
      showToast("请先输入内容。", true);
      return;
    }
    inputs.forEach((entry) => renderDraft(results, entry.kind, emptyDraft(entry.kind, entry.originalQuery), onSaved, showToast));
    status.textContent = "已生成填写卡。可以直接确认保存，也可以修改后保存。";
  });
}
