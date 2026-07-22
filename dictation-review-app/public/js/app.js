import { setupAddContentPage } from "./add-content-ui.js";
import { canEnrichExistingItem, enrichExistingItem } from "./add-content.js";
import { exportBackupFile, importBackupFile } from "./backup.js";
import { makeManualRelatedWord, safeFetchCharacterRecommendations, sanitizeRelatedWords } from "./character-reinforcement.js";
import {
  clearSessionStorage,
  createDictationSession,
  getCardView,
  loadSessionFromStorage,
  recordCardResult,
  saveSessionToStorage,
  takeNextCard,
  tokenizeText
} from "./dictation-session.js";
import { dictationListLabel, formatAccuracyRatio, quickFeedbackForCard } from "./dictation-list.js";
import { archiveItem, getAllFromStore, getAllItems, openDatabase } from "./db.js";
import { getSettings, updateSettings } from "./db.js";
import { toLocalDate } from "./date-utils.js";
import {
  createRewardRedemption,
  readTodoListRewardBridge,
  rewardBalance,
  rewardRedeemed,
  summarizeRecent,
  syncDictationRewardToSharedLedger,
  syncRewardRedemptionToSharedLedger,
  upsertDailyAchievement
} from "./daily-rewards.js";
import { buildTodayQueue, buildTodayStats, filterQueueByMode } from "./queue-builder.js";
import { renderLearnedSummary, renderLibrary, renderLibrarySummary, renderTodaySummary, setupNavigation, showToast } from "./ui.js";

window.__xiaokuiModuleReady = true;

const todaySummary = document.querySelector("#today-summary");
const learnedSummary = document.querySelector("#learned-summary");
const todayDate = document.querySelector("#today-date");
const rewardSummary = document.querySelector("#reward-summary");
const rewardRedeemForm = document.querySelector("#reward-redeem-form");
const rewardRedeemProduct = document.querySelector("#reward-redeem-product");
const rewardRedeemAmount = document.querySelector("#reward-redeem-amount");
const rewardRedeemList = document.querySelector("#reward-redeem-list");
const achievementHistory = document.querySelector("#achievement-history");
const librarySummary = document.querySelector("#library-summary");
const libraryList = document.querySelector("#library-list");
const libraryEnrichAllButton = document.querySelector("#library-enrich-all-button");
const dictationPanel = document.querySelector("#dictation-panel");
const exportButton = document.querySelector("#export-backup-button");
const importInput = document.querySelector("#import-backup-input");
const celebration = document.querySelector("#celebration");
const closeCelebration = document.querySelector("#closeCelebration");
const danceFrame = document.querySelector("#danceFrame");
const danceFallback = document.querySelector("#danceFallback");
const runtimeWarning = document.querySelector("#runtime-warning");

const CELEBRATION_KEY = "dictation-review-celebration-played-bvids";
const BILIBILI_DANCE_VIDEOS = [
  { bvid: "BV1kfjR6uEye", title: "洛天依舞蹈视频 1" },
  { bvid: "BV1fj41187R8", title: "洛天依舞蹈视频 2" },
  { bvid: "BV1P4411F7aa", title: "洛天依舞蹈视频 3" },
  { bvid: "BV11s411k7mE", title: "洛天依舞蹈视频 4" },
  { bvid: "BV194Nc63Ehg", title: "洛天依舞蹈视频 5" },
  { bvid: "BV1mr421K7dE", title: "洛天依舞蹈视频 6" },
  { bvid: "BV1Mw4m1Y79t", title: "洛天依舞蹈视频 7" }
];

let currentItems = [];
let allLibraryItems = [];
let reviewEvents = [];
let currentQueue = [];
let currentSession = null;
let submittingResult = false;
let dictationUiMode = "card";
let dictationFilterMode = "all";
let danceFallbackTimer = 0;
let lastDanceBvid = "";
let libraryFilter = "all";
const celebratedDates = new Set();

function filterLibraryItems(items, mode = "all") {
  if (mode === "english") return items.filter((item) => item.type === "english_word");
  if (mode === "chinese") return items.filter((item) => item.type === "chinese_phrase");
  if (mode === "poem") return items.filter((item) => item.type === "poem" || item.type === "poem_line");
  return items;
}

async function archiveLibraryItem(id) {
  try {
    await archiveItem(id);
    showToast("已归档。");
    await refresh();
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderLibraryView() {
  renderLibrarySummary(librarySummary, allLibraryItems, reviewEvents, toLocalDate());
  renderLibrary(libraryList, filterLibraryItems(currentItems, libraryFilter), archiveLibraryItem);
}

async function refresh() {
  const today = toLocalDate();
  const settings = await getSettings();
  const achievementRecords = settings?.dailyAchievementRecords || {};
  const redemptions = settings?.rewardRedemptions || [];
  allLibraryItems = await getAllItems(true);
  currentItems = allLibraryItems.filter((item) => item.status !== "archived");
  reviewEvents = await getAllFromStore("reviewEvents");
  currentQueue = buildTodayQueue(currentItems, today);
  todayDate.textContent = today;
  renderTodaySummary(todaySummary, buildTodayStats(currentItems, today));
  renderLearnedSummary(learnedSummary, currentItems);
  renderRewardSummary(achievementRecords, redemptions, today, currentQueue.length);
  renderRewardRedemptions(redemptions);
  renderAchievementHistory(achievementRecords, today);
  renderLibraryView();
}

function formatMoney(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return `¥${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

function rewardLabel(record) {
  if (!record?.targetCount) return { text: "待完成", mark: "" };
  if (record.status === "perfect") return { text: "满分达成", mark: "+2" };
  if (record.status === "good") return { text: "稳定完成", mark: "+1" };
  if (record.status === "penalty") return { text: "需要补一下", mark: "-1" };
  return { text: "还差一点", mark: "0" };
}

function renderRewardSummary(records, redemptions, today, pendingCount) {
  const todayRecord = records[today] || { targetCount: pendingCount, completedCount: 0, rate: 0, rewardAmount: 0, status: "none" };
  const localBalance = rewardBalance(records, redemptions);
  const sharedReward = readTodoListRewardBridge();
  const balance = sharedReward?.balance ?? localBalance;
  const redeemed = sharedReward?.redeemed ?? rewardRedeemed(redemptions);
  rewardSummary.replaceChildren();

  const rows = [
    { className: "reward-card balance", label: sharedReward ? "共享余额" : "累计奖励", value: formatMoney(balance) },
    { className: "reward-card", label: "今日达成率", value: `${todayRecord.rate || 0}%` },
    { className: "reward-card", label: "今日完成", value: `${todayRecord.completedCount || 0}/${todayRecord.targetCount || pendingCount || 0}` },
    { className: "reward-card", label: "今日奖励", value: formatMoney(todayRecord.rewardAmount || 0) },
    { className: "reward-card", label: "已抵扣", value: formatMoney(redeemed) }
  ];

  for (const row of rows) {
    const card = document.createElement("div");
    card.className = row.className;
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("strong");
    value.textContent = row.value;
    card.append(label, value);
    rewardSummary.append(card);
  }
}

function renderRewardRedemptions(redemptions = []) {
  rewardRedeemList.replaceChildren();
  const recent = [...redemptions]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3);

  if (!recent.length) {
    const empty = document.createElement("div");
    empty.className = "redeem-item";
    const label = document.createElement("span");
    label.textContent = "还没有抵扣记录";
    const value = document.createElement("strong");
    value.textContent = formatMoney(0);
    empty.append(label, value);
    rewardRedeemList.append(empty);
    return;
  }

  for (const item of recent) {
    const row = document.createElement("div");
    row.className = "redeem-item";
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.product || "抵扣";
    const date = document.createElement("span");
    date.textContent = formatRewardDate(item.createdAt);
    detail.append(name, document.createElement("br"), date);
    const amount = document.createElement("strong");
    amount.textContent = formatMoney(item.amount || 0);
    row.append(detail, amount);
    rewardRedeemList.append(row);
  }
}

function formatRewardDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function renderAchievementHistory(records, today) {
  const days = summarizeRecent(records, today);
  achievementHistory.replaceChildren();

  for (const record of days) {
    const meta = rewardLabel(record);
    const card = document.createElement("article");
    card.className = `day-card ${record.status || "none"}`;
    card.innerHTML = `
      <div class="day-date"><span>${record.date.slice(5)}</span><span>${record.date === today ? "今天" : ""}</span></div>
      <div class="day-rate">${record.rate || 0}%</div>
      <div class="reward-badge ${record.status || "none"}">${meta.mark ? `<span>${meta.mark}</span>` : ""}<span>${meta.text}</span></div>
      <div class="mini-stats">${record.targetCount ? `完成 ${record.completedCount}/${record.targetCount}` : ""}</div>
      <div class="mini-progress"><span style="width: ${record.rate || 0}%"></span></div>
    `;
    achievementHistory.append(card);
  }
}

function setupBackupControls() {
  exportButton.addEventListener("click", async () => {
    try {
      await exportBackupFile();
      showToast("备份已导出。");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      await importBackupFile(file);
    } catch (error) {
      importInput.value = "";
      showToast(error.message, true);
    }
  });
}

function setupRewardRedeemControls() {
  rewardRedeemForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const redemption = createRewardRedemption({
        product: rewardRedeemProduct.value,
        amount: rewardRedeemAmount.value
      });
      const settings = await getSettings();
      const redemptions = [redemption, ...(settings?.rewardRedemptions || [])];
      await updateSettings({ rewardRedemptions: redemptions });
      syncRewardRedemptionToSharedLedger(redemption);
      rewardRedeemProduct.value = "";
      rewardRedeemAmount.value = "1";
      showToast("抵扣已记录。");
      await refresh();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function setupTaskStartButtons() {
  document.querySelectorAll("[data-start-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      await refresh();
      const mode = button.dataset.startMode;
      dictationFilterMode = mode;
      updateDictationModeButtons();
      const filtered = filterQueueByMode(currentQueue, mode);
      if (!filtered.length) {
        showToast(`这个范围今天没有可${dictationUiMode === "list" ? "听写" : "背默"}内容。`, true);
        if (dictationUiMode === "list") {
          document.querySelector('[data-view="dictation"]')?.click();
          renderDictationList(mode);
        }
        return;
      }

      document.querySelector('[data-view="dictation"]')?.click();
      if (dictationUiMode === "list") {
        currentSession = null;
        clearSessionStorage();
        renderDictationList(mode);
        return;
      }

      currentSession = takeNextCard(createDictationSession(filtered, currentItems, { mode }));
      saveSessionToStorage(currentSession);
      renderDictation();
    });
  });

  document.querySelectorAll("[data-dictation-ui]").forEach((button) => {
    button.addEventListener("click", async () => {
      dictationUiMode = button.dataset.dictationUi || "card";
      document.querySelectorAll("[data-dictation-ui]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      await refresh();
      if (dictationUiMode === "list") {
        currentSession = null;
        clearSessionStorage();
        renderDictationList(dictationFilterMode);
      } else {
        renderDictation();
      }
    });
  });
}

function updateDictationModeButtons() {
  document.querySelectorAll("[data-start-mode]").forEach((button) => {
    button.classList.toggle("active", (button.dataset.startMode || "all") === dictationFilterMode);
  });
}

function setupLibraryFilterButtons() {
  document.querySelectorAll("[data-library-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      libraryFilter = button.dataset.libraryFilter || "all";
      document.querySelectorAll("[data-library-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      renderLibraryView();
    });
  });
}

function setupLibraryEnrichAllButton() {
  libraryEnrichAllButton?.addEventListener("click", async () => {
    const candidates = filterLibraryItems(currentItems, libraryFilter).filter(canEnrichExistingItem);
    if (!candidates.length) {
      showToast("当前筛选范围没有可联网补全的内容。", true);
      return;
    }

    libraryEnrichAllButton.disabled = true;
    let successCount = 0;
    try {
      showToast(`正在联网补全 ${candidates.length} 条内容...`);
      for (const item of candidates) {
        await enrichExistingItem(item);
        successCount += 1;
      }
      showToast(`已补全 ${successCount} 条内容。`);
      await refresh();
    } catch (error) {
      showToast(error.message || `已补全 ${successCount} 条，后续补全失败。请确认通过电脑后端访问。`, true);
      await refresh();
    } finally {
      libraryEnrichAllButton.disabled = false;
    }
  });
}

function setupCelebrationControls() {
  closeCelebration.addEventListener("click", closeCelebrationLayer);
  danceFrame.addEventListener("load", () => window.clearTimeout(danceFallbackTimer));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && celebration.classList.contains("show")) {
      closeCelebrationLayer();
    }
  });
}

function makeLine(text, className = "") {
  const div = document.createElement("div");
  if (className) div.className = className;
  div.textContent = text;
  return div;
}

function makeButton(text, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  if (className) button.className = className;
  button.addEventListener("click", handler);
  return button;
}

function renderDictation() {
  if (dictationUiMode === "list") {
    renderDictationList(dictationFilterMode);
    return;
  }

  dictationPanel.replaceChildren();

  if (!currentSession) {
    dictationPanel.textContent = "请选择上方范围开始背默。";
    return;
  }

  if (!currentSession.currentCard && currentSession.queue.length) {
    currentSession = takeNextCard(currentSession);
    saveSessionToStorage(currentSession);
  }

  if (!currentSession.currentCard) {
    renderCompletion();
    return;
  }

  const card = currentSession.currentCard;
  const view = getCardView(card);
  const article = document.createElement("article");
  article.className = "dictation-card";
  article.append(makeLine(card.isRetry ? "同日重背" : "正式背默", "eyebrow"));
  article.append(makeLine(view.title, "card-title"));

  const prompt = document.createElement("div");
  prompt.className = "prompt-box";
  view.promptLines.forEach((line) => prompt.append(makeLine(line)));
  article.append(prompt);

  const answer = document.createElement("div");
  answer.className = "answer-box hidden";
  view.answerLines.forEach((line) => answer.append(makeLine(line)));
  article.append(answer);

  const actions = document.createElement("div");
  actions.className = "form-actions";
  const showAnswerButton = makeButton("显示答案", () => {
    answer.classList.remove("hidden");
    showAnswerButton.disabled = true;
    renderFeedbackControls(article, view, card);
  });
  actions.append(showAnswerButton);
  article.append(actions);

  const progress = makeLine(`剩余 ${currentSession.queue.length} 张`, "muted");
  article.append(progress);
  dictationPanel.append(article);
}

function renderDictationList(mode = "all") {
  dictationPanel.replaceChildren();
  const filtered = filterQueueByMode(currentQueue, mode);
  if (!filtered.length) {
    dictationPanel.textContent = "这个范围今天没有可听写内容。";
    return;
  }

  const list = document.createElement("div");
  list.className = "quick-dictation-list";

  filtered.forEach((card) => {
    const item = currentItems.find((entry) => entry.id === card.itemId) || card.itemSnapshot;
    const preparedCard = { ...card, itemSnapshot: structuredClone(item) };
    const row = document.createElement("article");
    row.className = `quick-dictation-row ${card.cardType}`;

    const title = document.createElement("strong");
    title.className = "quick-dictation-name";
    title.textContent = dictationListLabel(preparedCard);

    const accuracy = document.createElement("span");
    accuracy.className = "quick-dictation-accuracy";
    accuracy.textContent = formatAccuracyRatio(item);

    const actions = document.createElement("div");
    actions.className = "quick-dictation-actions";
    actions.append(
      makeButton("√", () => submitQuickDictation(preparedCard, true, filtered.length), "quick-result-button correct"),
      makeButton("×", () => submitQuickDictation(preparedCard, false, filtered.length), "quick-result-button wrong")
    );

    row.append(title, accuracy, actions);
    list.append(row);
  });

  dictationPanel.append(list);
}

async function submitQuickDictation(card, isCorrect, pendingBefore) {
  if (submittingResult) return;
  submittingResult = true;
  try {
    const session = takeNextCard(createDictationSession([card], currentItems, {
      today: toLocalDate(),
      mode: "all"
    }));
    await recordCardResult(session, quickFeedbackForCard(session.currentCard, isCorrect));
    await recordQuickAchievement(session.date, pendingBefore);
    await refresh();
    renderDictationList(dictationFilterMode);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submittingResult = false;
  }
}

async function recordQuickAchievement(date, pendingBefore) {
  const settings = await getSettings();
  const records = settings?.dailyAchievementRecords || {};
  const existing = records[date] || {};
  const completedCount = (existing.completedCount || 0) + 1;
  const targetCount = Math.max(existing.targetCount || 0, pendingBefore || 0, completedCount);
  const nextRecords = upsertDailyAchievement(records, date, { targetCount, completedCount });
  const updated = await updateSettings({ dailyAchievementRecords: nextRecords });
  const achievement = updated.dailyAchievementRecords[date];
  syncDictationRewardToSharedLedger(achievement);

  if (achievement?.rate === 100 && !celebratedDates.has(date)) {
    launchCelebration(date);
  }
}

function renderFeedbackControls(article, view, card) {
  const controls = document.createElement("div");
  controls.className = "feedback-controls";

  const submit = async (feedback) => {
    if (submittingResult) return;
    submittingResult = true;
    try {
      currentSession = await recordCardResult(currentSession, feedback);
      if (currentSession.status === "completed" && !currentSession.rewardRecorded) {
        currentSession = await finalizeDailyAchievement(currentSession);
      }
      saveSessionToStorage(currentSession);
      await refresh();
      renderDictation();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      submittingResult = false;
    }
  };

  if (view.feedbackMode === "english_both") {
    controls.append(
      makeButton("正确", () => submit({ kind: "correct" })),
      makeButton("拼写错", () => submit({ kind: "spelling_wrong" })),
      makeButton("音标错", () => submit({ kind: "phonetic_wrong" })),
      makeButton("两项都错", () => submit({ kind: "both_wrong" }))
    );
  } else if (view.feedbackMode === "english_spelling" || view.feedbackMode === "english_phonetic" || view.feedbackMode === "character") {
    controls.append(
      makeButton("正确", () => submit({ kind: "correct" })),
      makeButton("错误", () => submit({ kind: "wrong" }))
    );
  } else {
    controls.append(
      makeButton("正确", () => submit({ kind: "correct" })),
      makeButton("错误，选择错字", () => renderCharacterPicker(article, card, submit)),
      makeButton("整个词句都不会", () => renderEntireUnknown(article, submit))
    );
  }

  article.append(controls);
}

async function finalizeDailyAchievement(session) {
  const settings = await getSettings();
  const records = upsertDailyAchievement(settings?.dailyAchievementRecords || {}, session.date, {
    targetCount: session.dailyTargetCount || session.stats.formalCount,
    completedCount: session.stats.formalCount
  });
  const updated = await updateSettings({ dailyAchievementRecords: records });
  const achievement = updated.dailyAchievementRecords[session.date];
  syncDictationRewardToSharedLedger(achievement);

  if (achievement?.rate === 100 && !celebratedDates.has(session.date)) {
    launchCelebration(session.date);
  }

  return {
    ...session,
    rewardRecorded: true,
    dailyAchievement: achievement
  };
}

function renderEntireUnknown(article, submit) {
  const box = document.createElement("div");
  box.className = "wrong-detail-box";
  const input = document.createElement("input");
  input.placeholder = "可选：记录学生写成了什么";
  box.append(makeLine("本次选择：整个词句都不会"));
  box.append(input);
  box.append(makeButton("保存结果", () => submit({ kind: "entire_unknown", studentAnswer: input.value.trim() })));
  article.append(box);
}

function renderCharacterPicker(article, card, submit) {
  const existing = article.querySelector(".wrong-detail-box");
  if (existing) existing.remove();

  const box = document.createElement("div");
  box.className = "wrong-detail-box";
  const selected = new Map();
  const selectedText = makeLine("本次选择：未选择错字", "muted");
  const tokenWrap = document.createElement("div");
  tokenWrap.className = "char-token-grid";

  tokenizeText(card.itemSnapshot.text).forEach((token) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = token.clickable ? "char-token" : "char-token punctuation";
    button.textContent = token.char === " " ? "空格" : token.char;
    button.disabled = !token.clickable;
    button.addEventListener("click", () => {
      if (selected.has(token.index)) {
        selected.delete(token.index);
        button.classList.remove("selected");
      } else {
        selected.set(token.index, { char: token.char, index: token.index });
        button.classList.add("selected");
      }
      const values = [...selected.values()].map((entry) => `${entry.char}@${entry.index}`);
      selectedText.textContent = values.length ? `本次选择：${values.join("、")}` : "本次选择：未选择错字";
    });
    tokenWrap.append(button);
  });

  const input = document.createElement("input");
  input.placeholder = "可选：记录学生写成了什么";
  box.append(makeLine("点击具体错字。标点符号不可点击。"));
  box.append(tokenWrap, selectedText, input);
  box.append(makeButton("保存错字结果", async () => {
    const wrongCharacters = [...selected.values()].sort((a, b) => a.index - b.index);
    if (!wrongCharacters.length) {
      showToast("请先选择错字，或使用“整个词句都不会”。", true);
      return;
    }
    await renderRelatedWordConfirmation(article, card, wrongCharacters, input.value.trim(), submit);
  }));
  article.append(box);
}

async function renderRelatedWordConfirmation(article, card, wrongCharacters, studentAnswer, submit) {
  const existing = article.querySelector(".related-word-box");
  if (existing) existing.remove();

  const box = document.createElement("div");
  box.className = "wrong-detail-box related-word-box";
  box.append(makeLine("正在查询错字关联词...", "muted"));
  article.append(box);

  const uniqueCharacters = [...new Set(wrongCharacters.map((entry) => entry.char))];
  const recommendations = new Map();

  for (const character of uniqueCharacters) {
    const result = await safeFetchCharacterRecommendations(character, card.itemSnapshot.text);
    recommendations.set(character, result);
  }

  box.replaceChildren();
  box.append(makeLine("关联词确认", "card-title"));
  box.append(makeLine("推荐词需要家长勾选后才会用于错字强化；也可以不选。", "muted"));

  const controlsByCharacter = new Map();

  for (const character of uniqueCharacters) {
    const result = recommendations.get(character);
    const section = document.createElement("div");
    section.className = "related-word-section";
    section.append(makeLine(`目标字：${character}`, "eyebrow"));

    if (!result.success) {
      section.append(makeLine(result.error || "关联词查询失败，可继续保存原词复习。", "danger"));
    }

    const sourceLines = [];
    const words = sanitizeRelatedWords(character, card.itemSnapshot.text, result.result.data?.relatedWords);
    const checkboxes = [];
    for (const word of words) {
      const label = document.createElement("label");
      label.className = "related-word-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = word.word;
      label.append(checkbox, document.createTextNode(`${word.word} ${word.pinyin || ""} ${word.definition || ""}`));
      section.append(label);
      checkboxes.push({ checkbox, word });
    }

    const sources = result.result.sources || [];
    for (const source of sources) {
      sourceLines.push([source.title, source.publisher].filter(Boolean).join(" / ") || source.url);
    }
    if (sourceLines.length) section.append(makeLine(`来源：${sourceLines.join("；")}`, "muted"));
    if (!words.length) section.append(makeLine("暂无可用推荐词。", "muted"));

    const manualWord = document.createElement("input");
    manualWord.placeholder = `手动添加一个包含“${character}”的常用词`;
    const manualPinyin = document.createElement("input");
    manualPinyin.placeholder = "可选：拼音";
    const manualDefinition = document.createElement("input");
    manualDefinition.placeholder = "可选：简明释义";
    section.append(manualWord, manualPinyin, manualDefinition);

    controlsByCharacter.set(character, {
      checkboxes,
      manualWord,
      manualPinyin,
      manualDefinition
    });
    box.append(section);
  }

  const actions = document.createElement("div");
  actions.className = "form-actions";
  actions.append(
    makeButton("确认关联词并保存", () => {
      const relatedWordsByCharacter = {};
      for (const [character, controls] of controlsByCharacter.entries()) {
        const selectedWords = controls.checkboxes
          .filter(({ checkbox }) => checkbox.checked)
          .map(({ word }) => word);
        const manual = makeManualRelatedWord(character, {
          word: controls.manualWord.value,
          pinyin: controls.manualPinyin.value,
          definition: controls.manualDefinition.value
        });
        relatedWordsByCharacter[character] = sanitizeRelatedWords(character, card.itemSnapshot.text, [
          ...selectedWords,
          ...(manual ? [manual] : [])
        ]);
      }
      submit({ kind: "partial_wrong", wrongCharacters, studentAnswer, relatedWordsByCharacter });
    }),
    makeButton("不选关联词，继续保存", () => submit({
      kind: "partial_wrong",
      wrongCharacters,
      studentAnswer,
      relatedWordsByCharacter: {}
    })),
    makeButton("取消", () => box.remove())
  );
  box.append(actions);
}

function renderCompletion() {
  clearSessionStorage();
  const stats = currentSession.stats;
  dictationPanel.replaceChildren();
  const panel = document.createElement("article");
  panel.className = "completion-panel";
  panel.append(makeLine("今日背默完成", "card-title"));

  const rows = [
    ["今日正式背默数量", stats.formalCount],
    ["正确数量", stats.correctCount],
    ["错误数量", stats.wrongCount],
    ["拼写错误数量", stats.spellingWrongCount],
    ["音标错误数量", stats.phoneticWrongCount],
    ["中文错字数量", stats.chineseWrongCharCount],
    ["古诗错字数量", stats.poemWrongCharCount],
    ["当天重背写对", stats.retryCorrectCount],
    ["当天重背仍错", stats.retryWrongCount],
    ["明天继续复习数量", stats.tomorrowCount]
  ];

  const grid = document.createElement("div");
  grid.className = "stats-grid";
  rows.forEach(([label, value]) => {
    const cell = document.createElement("div");
    cell.className = "stat-card";
    cell.append(makeLine(String(value), "stat-value"), makeLine(label, "stat-label"));
    grid.append(cell);
  });
  panel.append(grid);
  panel.append(makeButton("回到今日任务", async () => {
    currentSession = null;
    await refresh();
    document.querySelector('[data-view="today"]')?.click();
  }));
  dictationPanel.append(panel);
}

function launchCelebration(dateKey) {
  celebratedDates.add(dateKey);
  celebration.classList.remove("video-ready");
  celebration.classList.add("show");
  celebration.setAttribute("aria-hidden", "false");
  createConfetti();

  window.setTimeout(() => {
    celebration.classList.add("video-ready");
    playDanceVideo();
  }, 1800);
}

function createConfetti() {
  const colors = ["#69dff2", "#7d8cff", "#ff6fb1", "#ffd65a", "#18a982", "#ffffff"];
  celebration.querySelectorAll(".confetti-piece").forEach((piece) => piece.remove());
  for (let index = 0; index < 160; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty("--confetti-color", colors[index % colors.length]);
    piece.style.setProperty("--fall-duration", `${2.1 + Math.random() * 2.2}s`);
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 180}px`);
    piece.style.setProperty("--spin", `${Math.random() * 180}deg`);
    piece.style.animationDelay = `${Math.random() * 0.9}s`;
    celebration.appendChild(piece);
  }
}

function playDanceVideo() {
  const video = pickDanceVideo();
  danceFallback.hidden = true;
  danceFrame.hidden = false;
  danceFrame.title = video.title;
  danceFrame.src = bilibiliEmbedUrl(video.bvid);
  window.clearTimeout(danceFallbackTimer);
  danceFallbackTimer = window.setTimeout(showDanceFallback, 6000);
}

function closeCelebrationLayer() {
  celebration.classList.remove("show", "video-ready");
  celebration.setAttribute("aria-hidden", "true");
  window.clearTimeout(danceFallbackTimer);
  danceFrame.src = "";
  celebration.querySelectorAll(".confetti-piece").forEach((piece) => piece.remove());
}

function showDanceFallback() {
  danceFrame.hidden = true;
  danceFallback.hidden = false;
}

function pickDanceVideo() {
  const played = readPlayedDanceBvids();
  const remaining = BILIBILI_DANCE_VIDEOS.filter((video) => !played.includes(video.bvid));
  const freshPool = remaining.length ? remaining : BILIBILI_DANCE_VIDEOS;
  const choices = freshPool.filter((video) => video.bvid !== lastDanceBvid);
  const pool = choices.length ? choices : freshPool;
  const next = pool[Math.floor(Math.random() * pool.length)];
  lastDanceBvid = next.bvid;
  writePlayedDanceBvid(next.bvid, remaining.length ? played : []);
  return next;
}

function readPlayedDanceBvids() {
  try {
    const saved = JSON.parse(localStorage.getItem(CELEBRATION_KEY) || "[]");
    const allowed = new Set(BILIBILI_DANCE_VIDEOS.map((video) => video.bvid));
    return Array.isArray(saved) ? saved.filter((bvid) => allowed.has(bvid)) : [];
  } catch {
    return [];
  }
}

function writePlayedDanceBvid(bvid, played) {
  try {
    localStorage.setItem(CELEBRATION_KEY, JSON.stringify([...new Set([...played, bvid])]));
  } catch {
    // Celebration rotation is nice-to-have; learning data remains in IndexedDB.
  }
}

function bilibiliEmbedUrl(bvid) {
  const params = new URLSearchParams({
    bvid,
    autoplay: "1",
    muted: "0",
    high_quality: "1",
    danmaku: "0"
  });
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

async function restoreSessionIfAny() {
  const restored = loadSessionFromStorage();
  if (!restored) return;
  currentSession = restored;
  renderDictation();
  showToast("已恢复未完成的背默会话。");
}

async function boot() {
  if (runtimeWarning) {
    const host = window.location.hostname;
    runtimeWarning.hidden = !(window.location.protocol === "file:" || host.endsWith("github.io"));
  }

  setupNavigation();
  setupAddContentPage({
    onSaved: refresh,
    showToast
  });
  setupBackupControls();
  setupRewardRedeemControls();
  setupTaskStartButtons();
  setupLibraryFilterButtons();
  setupLibraryEnrichAllButton();
  setupCelebrationControls();

  try {
    await openDatabase();
  } catch (error) {
    showToast(`IndexedDB 不可用，已尝试使用本地兜底存储：${error.message}`, true);
  }

  try {
    await refresh();
    await restoreSessionIfAny();
  } catch (error) {
    todaySummary.textContent = `数据加载失败：${error.message}`;
    libraryList.textContent = "无法读取学习库。";
    showToast(error.message, true);
  }
}

boot();
