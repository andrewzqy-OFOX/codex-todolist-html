(function () {
  const DB_NAME = "junior-dictation-review";
  const DB_VERSION = 1;
  const STORE_NAMES = ["items", "reviewEvents", "enrichmentCache", "settings"];

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function today() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(dateText, amount) {
    const date = new Date(`${dateText}T00:00:00`);
    date.setDate(date.getDate() + amount);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function localId(prefix) {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function splitLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  let libraryFilter = "all";

  function createTrack(date) {
    return {
      stage: 0,
      correctStreak: 0,
      totalCorrect: 0,
      totalWrong: 0,
      nextReviewDate: date,
      status: "learning",
      lastReviewedDate: null
    };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const items = db.objectStoreNames.contains("items") ? null : db.createObjectStore("items", { keyPath: "id" });
        if (items) {
          items.createIndex("type", "type");
          items.createIndex("status", "status");
          items.createIndex("createdDate", "createdDate");
          items.createIndex("nextReviewDate", "nextReviewDate");
          items.createIndex("parentId", "parentId");
        }
        const events = db.objectStoreNames.contains("reviewEvents") ? null : db.createObjectStore("reviewEvents", { keyPath: "id" });
        if (events) {
          events.createIndex("itemId", "itemId");
          events.createIndex("reviewUnit", "reviewUnit");
          events.createIndex("date", "date");
          events.createIndex("result", "result");
          events.createIndex("createdAt", "createdAt");
        }
        const cache = db.objectStoreNames.contains("enrichmentCache") ? null : db.createObjectStore("enrichmentCache", { keyPath: "id" });
        if (cache) {
          cache.createIndex("queryType", "queryType");
          cache.createIndex("normalizedQuery", "normalizedQuery");
          cache.createIndex("fetchedAt", "fetchedAt");
        }
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开本地数据库。"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("保存失败。"));
      transaction.onabort = () => reject(transaction.error || new Error("保存被浏览器中断。"));
    });
  }

  async function getItems(includeArchived = false) {
    const db = await openDb();
    const tx = db.transaction("items", "readonly");
    const request = tx.objectStore("items").getAll();
    const items = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return includeArchived ? items : items.filter((item) => item.status !== "archived");
  }

  async function getReviewEvents() {
    const db = await openDb();
    const tx = db.transaction("reviewEvents", "readonly");
    const request = tx.objectStore("reviewEvents").getAll();
    const events = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return events;
  }

  async function getSettings() {
    const db = await openDb();
    const tx = db.transaction("settings", "readonly");
    const request = tx.objectStore("settings").get("main");
    const settings = await new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => resolve({});
    });
    db.close();
    return settings || {};
  }

  async function saveSettings(patch) {
    const current = await getSettings();
    const next = {
      id: "main",
      schemaVersion: 1,
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    const db = await openDb();
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put(next);
    await transactionDone(tx);
    db.close();
    return next;
  }

  async function addItems(items) {
    const db = await openDb();
    const tx = db.transaction(STORE_NAMES, "readwrite");
    const store = tx.objectStore("items");
    for (const item of items) store.add(item);
    await transactionDone(tx);
    db.close();
  }

  async function updateItem(item) {
    const next = { ...item, updatedAt: new Date().toISOString() };
    const db = await openDb();
    const tx = db.transaction("items", "readwrite");
    tx.objectStore("items").put(next);
    await transactionDone(tx);
    db.close();
    return next;
  }

  async function addReviewEvent(event) {
    const db = await openDb();
    const tx = db.transaction("reviewEvents", "readwrite");
    tx.objectStore("reviewEvents").add({
      id: localId("review"),
      createdAt: new Date().toISOString(),
      ...event
    });
    await transactionDone(tx);
    db.close();
  }

  function metadata(kind, originalQuery, data) {
    const now = new Date().toISOString();
    return {
      ...data,
      sourceRecords: [],
      fetchedAt: now,
      userConfirmedAt: now,
      confidence: "low",
      originalQuery,
      queryType: kind,
      manuallyEntered: true,
      warnings: ["静态版直接保存，未联网校验。以后可在电脑后端版点击“联网补全”。"],
      ambiguities: []
    };
  }

  function buildItems(kind, originalQuery) {
    const date = today();
    const now = new Date().toISOString();

    if (kind === "english") {
      const word = originalQuery.trim();
      return [{
        id: localId("english"),
        type: "english_word",
        text: word,
        status: "active",
        createdDate: date,
        nextReviewDate: date,
        parentId: null,
        reviewUnit: "whole_item",
        spellingTrack: createTrack(date),
        phoneticTrack: createTrack(date),
        payload: metadata(kind, word, {
          normalizedWord: word,
          ukPhonetic: "",
          usPhonetic: "",
          partsOfSpeech: [],
          meaningsZh: [],
          alternativeCandidates: []
        }),
        createdAt: now,
        updatedAt: now
      }];
    }

    if (kind === "chinese") {
      const term = originalQuery.trim();
      return [{
        id: localId("chinese"),
        type: "chinese_phrase",
        text: term,
        status: "active",
        createdDate: date,
        nextReviewDate: date,
        parentId: null,
        reviewUnit: "whole_item",
        wholeItemTrack: createTrack(date),
        characterTracks: {},
        payload: metadata(kind, term, {
          normalizedTerm: term,
          pinyin: "",
          definition: "",
          synonyms: [],
          antonyms: [],
          pronunciationCandidates: []
        }),
        createdAt: now,
        updatedAt: now
      }];
    }

    const title = originalQuery.trim();
    const parentId = localId("poem");
    const parent = {
      id: parentId,
      type: "poem",
      text: title,
      status: "active",
      createdDate: date,
      nextReviewDate: date,
      parentId: null,
      reviewUnit: "reference",
      payload: metadata("poem", title, {
        title,
        alternativeTitle: "",
        author: "",
        dynasty: "",
        fullText: title,
        lines: [{ order: 1, text: title }],
        annotations: [],
        translation: "",
        candidates: [],
        versionWarnings: []
      }),
      createdAt: now,
      updatedAt: now
    };
    const line = {
      id: localId("poem-line"),
      type: "poem_line",
      text: title,
      status: "active",
      createdDate: date,
      nextReviewDate: date,
      parentId,
      parentPoemId: parentId,
      lineIndex: 1,
      title,
      author: "",
      reviewUnit: "whole_item",
      wholeItemTrack: createTrack(date),
      characterTracks: {},
      payload: metadata("poem_line", title, {
        parentPoemId: parentId,
        lineIndex: 1,
        title,
        author: "",
        dynasty: ""
      }),
      createdAt: now,
      updatedAt: now
    };
    return [parent, line];
  }

  function toast(message, isError) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("danger", Boolean(isError));
    el.classList.add("visible");
    window.setTimeout(() => el.classList.remove("visible"), 2800);
  }

  function setStatus(message, isError) {
    const el = $("#query-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("danger", Boolean(isError));
  }

  function activeKind() {
    return $(".add-tab.active")?.dataset.kind || "english";
  }

  function getInputs(kind) {
    if (kind === "english") return splitLines($("#english-input")?.value);
    if (kind === "chinese") return splitLines($("#chinese-input")?.value);
    const title = $("#poem-title-input")?.value.trim();
    return title ? [title] : [];
  }

  function duplicates(existing, kind, value) {
    const text = value.trim();
    if (kind === "english") {
      const normalized = text.toLowerCase();
      return existing.some((item) => item.type === "english_word" && String(item.text || "").trim().toLowerCase() === normalized);
    }
    if (kind === "chinese") {
      return existing.some((item) => item.type === "chinese_phrase" && String(item.text || "").trim() === text);
    }
    return existing.some((item) => item.type === "poem" && String(item.text || "").trim() === text);
  }

  function filterByMode(items, mode = "all") {
    if (mode === "english") return items.filter((item) => item.type === "english_word");
    if (mode === "chinese") return items.filter((item) => item.type === "chinese_phrase");
    if (mode === "poem") return items.filter((item) => item.type === "poem" || item.type === "poem_line");
    return items;
  }

  function applyDailyCategoryLimits(items) {
    const counts = { english_word: 0, chinese_phrase: 0, poem_line: 0 };
    const limits = { english_word: 40, chinese_phrase: 40, poem_line: 10 };
    return items.filter((item) => {
      if (item.type === "poem") return false;
      const limit = limits[item.type];
      if (!limit) return true;
      if (counts[item.type] >= limit) return false;
      counts[item.type] += 1;
      return true;
    });
  }

  function trackList(item) {
    const tracks = [];
    if (item.spellingTrack) tracks.push(item.spellingTrack);
    if (item.phoneticTrack) tracks.push(item.phoneticTrack);
    if (item.wholeItemTrack) tracks.push(item.wholeItemTrack);
    for (const track of Object.values(item.characterTracks || {})) tracks.push(track);
    return tracks;
  }

  function isMasteredItem(item) {
    const tracks = trackList(item);
    if (item.type === "poem") return false;
    return tracks.length > 0 && tracks.every((track) => track.status === "mastered" || track.active === false);
  }

  function libraryCategory(item) {
    if (item.type === "english_word") return "english";
    if (item.type === "chinese_phrase") return "chinese";
    if (item.type === "poem_line") return "poem";
    return null;
  }

  function renderLibrarySummary(allItems, events, date) {
    const container = $("#library-summary");
    if (!container) return;
    const buckets = {
      all: { label: "全部内容", total: 0, mastered: 0, archived: 0, correct: 0, totalEvents: 0 },
      english: { label: "English Words", total: 0, mastered: 0, archived: 0, correct: 0, totalEvents: 0 },
      chinese: { label: "中文生词", total: 0, mastered: 0, archived: 0, correct: 0, totalEvents: 0 },
      poem: { label: "古诗词", total: 0, mastered: 0, archived: 0, correct: 0, totalEvents: 0 }
    };
    const categoryById = new Map();
    allItems.forEach((item) => {
      const category = libraryCategory(item);
      if (!category) return;
      categoryById.set(item.id, category);
      buckets[category].total += 1;
      buckets.all.total += 1;
      if (item.status === "archived") {
        buckets[category].archived += 1;
        buckets.all.archived += 1;
      }
      if (item.status !== "archived" && isMasteredItem(item)) {
        buckets[category].mastered += 1;
        buckets.all.mastered += 1;
      }
    });
    const startDate = addDays(date, -6);
    events.forEach((event) => {
      if (!event?.date || event.date < startDate || event.date > date) return;
      const category = categoryById.get(event.itemId);
      if (!category) return;
      buckets[category].totalEvents += 1;
      buckets.all.totalEvents += 1;
      if (event.result === "correct") {
        buckets[category].correct += 1;
        buckets.all.correct += 1;
      }
    });
    container.replaceChildren();
    [buckets.all, buckets.english, buckets.chinese, buckets.poem].forEach((bucket) => {
      const accuracy = bucket.totalEvents ? Math.round((bucket.correct / bucket.totalEvents) * 100) : 0;
      const card = document.createElement("article");
      card.className = "library-summary-card";
      card.innerHTML = `
        <strong>${bucket.label}</strong>
        <div class="library-summary-main">${bucket.total}</div>
        <div class="library-summary-meta">
          <span>已熟悉 ${bucket.mastered}</span>
          <span>已归档 ${bucket.archived}</span>
          <span>近7天 ${bucket.totalEvents ? `${accuracy}%` : "暂无"}</span>
        </div>
      `;
      container.append(card);
    });
  }

  function itemAccuracy(item) {
    const totals = trackList(item).reduce((sum, track) => ({
      correct: sum.correct + (track.totalCorrect || 0),
      wrong: sum.wrong + (track.totalWrong || 0)
    }), { correct: 0, wrong: 0 });
    const total = totals.correct + totals.wrong;
    return {
      correct: totals.correct,
      total,
      percent: total ? Math.round((totals.correct / total) * 100) : 0
    };
  }

  function nextTrackAfterResult(track, isCorrect, date) {
    const intervals = [1, 3, 7, 15, 30, 60];
    const current = track || createTrack(date);
    if (!isCorrect) {
      return {
        ...current,
        stage: 0,
        correctStreak: 0,
        totalWrong: (current.totalWrong || 0) + 1,
        nextReviewDate: addDays(date, 1),
        status: "learning",
        lastReviewedDate: date
      };
    }
    const stage = Math.min((current.stage || 0) + 1, intervals.length);
    return {
      ...current,
      stage,
      correctStreak: (current.correctStreak || 0) + 1,
      totalCorrect: (current.totalCorrect || 0) + 1,
      nextReviewDate: addDays(date, intervals[Math.min(stage - 1, intervals.length - 1)]),
      status: stage >= intervals.length ? "mastered" : "learning",
      lastReviewedDate: date
    };
  }

  function earliestReviewDate(item) {
    const dates = trackList(item)
      .filter((track) => track.active !== false && track.nextReviewDate)
      .map((track) => track.nextReviewDate)
      .sort();
    return dates[0] || item.nextReviewDate;
  }

  async function recordFallbackDictationResult(item, isCorrect) {
    const date = today();
    const next = { ...item };
    if (item.type === "english_word") {
      next.spellingTrack = nextTrackAfterResult(item.spellingTrack, isCorrect, date);
      next.phoneticTrack = nextTrackAfterResult(item.phoneticTrack, isCorrect, date);
    } else {
      next.wholeItemTrack = nextTrackAfterResult(item.wholeItemTrack, isCorrect, date);
    }
    next.nextReviewDate = earliestReviewDate(next);
    await updateItem(next);
    await addReviewEvent({
      itemId: item.id,
      reviewUnit: item.type === "english_word" ? "english" : "whole_item",
      date,
      result: isCorrect ? "correct" : "incorrect",
      wrongCharacters: [],
      isSameDayRetry: false,
      dimensions: item.type === "english_word" ? ["spelling", "phonetic"] : ["whole_item"]
    });
  }

  function reviewLabel(item) {
    if (!item.nextReviewDate) return "未安排";
    const dayMs = 24 * 60 * 60 * 1000;
    const diff = Math.round((Date.parse(`${item.nextReviewDate}T00:00:00`) - Date.parse(`${today()}T00:00:00`)) / dayMs);
    if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
    if (diff === 0) return "今天复习";
    return `${diff} 天后复习`;
  }

  function renderTodaySummary(items) {
    const container = $("#today-summary");
    if (!container) return;
    const date = today();
    const due = applyDailyCategoryLimits(items.filter((item) => item.nextReviewDate <= date));
    const rows = [
      ["English Words", due.filter((item) => item.type === "english_word").length],
      ["中文生词", due.filter((item) => item.type === "chinese_phrase").length],
      ["古诗词", due.filter((item) => item.type === "poem_line").length],
      ["逾期任务", due.filter((item) => item.nextReviewDate < date).length],
      ["全部背默", due.length]
    ];
    container.replaceChildren();
    rows.forEach(([label, value]) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      if (label === "全部背默") card.classList.add("total-stat");
      card.innerHTML = `<div class="stat-value">${value}</div><div class="stat-label">${label}</div>`;
      container.append(card);
    });
  }

  function renderLearnedSummary(items) {
    const container = $("#learned-summary");
    if (!container) return;
    const rows = [
      ["English Words", items.filter((item) => item.type === "english_word" && isMasteredItem(item)).length],
      ["中文生词", items.filter((item) => item.type === "chinese_phrase" && isMasteredItem(item)).length],
      ["古诗句", items.filter((item) => item.type === "poem_line" && isMasteredItem(item)).length],
      ["合计", items.filter((item) => item.type !== "poem" && isMasteredItem(item)).length]
    ];
    container.replaceChildren();
    rows.forEach(([label, value]) => {
      const card = document.createElement("div");
      card.className = "learned-summary-card";
      card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
      container.append(card);
    });
  }

  function formatMoney(value) {
    const rounded = Math.round((Number(value) || 0) * 100) / 100;
    return `¥${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
  }

  function rewardRedeemed(redemptions) {
    return (Array.isArray(redemptions) ? redemptions : []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  function rewardBalance(records, redemptions) {
    const earned = Object.values(records || {}).reduce((sum, record) => sum + (Number(record.rewardAmount) || 0), 0);
    return earned - rewardRedeemed(redemptions);
  }

  function renderRewardSummary(settings, pendingCount, date) {
    const container = $("#reward-summary");
    if (!container) return;
    const records = settings?.dailyAchievementRecords || {};
    const redemptions = settings?.rewardRedemptions || [];
    const todayRecord = records[date] || {
      targetCount: pendingCount,
      completedCount: 0,
      rate: 0,
      rewardAmount: 0,
      status: "none"
    };
    const rows = [
      { className: "reward-card balance", label: "累计奖励", value: formatMoney(rewardBalance(records, redemptions)) },
      { className: "reward-card", label: "今日达成率", value: `${todayRecord.rate || 0}%` },
      { className: "reward-card", label: "今日完成", value: `${todayRecord.completedCount || 0}/${todayRecord.targetCount || pendingCount || 0}` },
      { className: "reward-card", label: "今日奖励", value: formatMoney(todayRecord.rewardAmount || 0) },
      { className: "reward-card", label: "已抵扣", value: formatMoney(rewardRedeemed(redemptions)) }
    ];
    container.replaceChildren();
    rows.forEach((row) => {
      const card = document.createElement("div");
      card.className = row.className;
      card.innerHTML = `<span>${row.label}</span><strong>${row.value}</strong>`;
      container.append(card);
    });
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

  function renderRewardRedemptions(settings) {
    const container = $("#reward-redeem-list");
    if (!container) return;
    const redemptions = Array.isArray(settings?.rewardRedemptions) ? settings.rewardRedemptions : [];
    const recent = [...redemptions]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3);
    container.replaceChildren();
    if (!recent.length) {
      const empty = document.createElement("div");
      empty.className = "redeem-item";
      empty.innerHTML = `<span>还没有抵扣记录</span><strong>${formatMoney(0)}</strong>`;
      container.append(empty);
      return;
    }
    recent.forEach((item) => {
      const row = document.createElement("div");
      row.className = "redeem-item";
      row.innerHTML = `
        <div><strong>${item.product || "抵扣"}</strong><br><span>${formatRewardDate(item.createdAt)}</span></div>
        <strong>${formatMoney(item.amount || 0)}</strong>
      `;
      container.append(row);
    });
  }

  function rewardMeta(record) {
    if (record.status === "perfect") return { mark: "+¥2", text: "已达成" };
    if (record.status === "good") return { mark: "+¥1", text: "已达成" };
    if (record.status === "penalty") return { mark: "-¥1", text: "待完成" };
    if (record.status === "partial") return { mark: "0", text: "继续加油" };
    return { mark: "", text: "待完成" };
  }

  function renderAchievementHistory(settings, date) {
    const container = $("#achievement-history");
    if (!container) return;
    const records = settings?.dailyAchievementRecords || {};
    container.replaceChildren();
    Array.from({ length: 7 }, (_, index) => addDays(date, -index)).forEach((day) => {
      const record = {
        date: day,
        rate: 0,
        rewardAmount: 0,
        targetCount: 0,
        completedCount: 0,
        status: "none",
        ...(records[day] || {})
      };
      const meta = rewardMeta(record);
      const card = document.createElement("article");
      card.className = `day-card ${record.status || "none"}`;
      card.innerHTML = `
        <div class="day-date"><span>${day.slice(5)}</span><span>${day === date ? "今天" : ""}</span></div>
        <div class="day-rate">${record.rate || 0}%</div>
        <div class="reward-badge ${record.status || "none"}">${meta.mark ? `<span>${meta.mark}</span>` : ""}<span>${meta.text}</span></div>
        <div class="mini-stats">${record.targetCount ? `完成 ${record.completedCount}/${record.targetCount}` : ""}</div>
        <div class="mini-progress"><span style="width: ${record.rate || 0}%"></span></div>
      `;
      container.append(card);
    });
  }

  function renderLibrary(items) {
    const container = $("#library-list");
    if (!container) return;
    const summary = $("#library-summary");
    const showsSummary = libraryFilter === "all";
    if (summary) summary.hidden = !showsSummary;
    container.hidden = showsSummary;
    if (showsSummary) {
      container.replaceChildren();
      return;
    }

    const visibleItems = filterByMode(items, libraryFilter);
    container.replaceChildren();
    if (!visibleItems.length) {
      container.textContent = "学习库暂无已确认内容。";
      return;
    }
    visibleItems.forEach((item) => {
      const row = document.createElement("article");
      row.className = "library-item";
      const accuracy = itemAccuracy(item);
      const title = document.createElement("strong");
      title.textContent = item.text;
      const meta = document.createElement("div");
      meta.className = "library-meta";
      meta.textContent = item.type;
      const content = document.createElement("div");
      content.className = "library-main";
      content.append(title, meta);
      const stats = document.createElement("div");
      stats.className = "library-card-stats";
      stats.innerHTML = `
        <div class="library-accuracy">${accuracy.percent}%</div>
        <div class="library-review-detail">
          <span>${reviewLabel(item)}</span>
          <span>正确 ${accuracy.correct}/${accuracy.total}</span>
        </div>
      `;
      row.append(content, stats);
      container.append(row);
    });
  }

  async function refresh() {
    try {
      const date = today();
      $("#today-date").textContent = date;
      const allItems = await getItems(true);
      const items = allItems.filter((item) => item.status !== "archived");
      const events = await getReviewEvents();
      const settings = await getSettings();
      const dueCount = items.filter((item) => item.nextReviewDate <= date).length;
      renderTodaySummary(items);
      renderLearnedSummary(items);
      renderLibrarySummary(allItems, events, date);
      renderRewardSummary(settings, dueCount, date);
      renderRewardRedemptions(settings);
      renderAchievementHistory(settings, date);
      renderLibrary(items);
    } catch (error) {
      toast(error.message || "读取本地数据失败。", true);
    }
  }

  async function startFallbackDictation(mode) {
    try {
      const date = today();
      const items = await getItems();
      const dueItems = filterByMode(applyDailyCategoryLimits(items.filter((item) => item.nextReviewDate <= date)), mode);
      $("[data-view='dictation']")?.click();
      const panel = $("#dictation-panel");
      if (!panel) return;
      panel.replaceChildren();
      if (!dueItems.length) {
        panel.textContent = "这个范围今天没有可听写内容。";
        return;
      }
      const list = document.createElement("div");
      list.className = "quick-dictation-list";
      dueItems.forEach((item) => {
        const accuracy = itemAccuracy(item);
        const row = document.createElement("article");
        row.className = "quick-dictation-row";
        const title = document.createElement("strong");
        title.className = "quick-dictation-name";
        title.textContent = item.text;
        const ratio = document.createElement("span");
        ratio.className = "quick-dictation-accuracy";
        ratio.textContent = `${accuracy.correct}/${accuracy.total}`;
        const actions = document.createElement("div");
        actions.className = "quick-dictation-actions";
        const correct = document.createElement("button");
        correct.type = "button";
        correct.className = "quick-result-button correct";
        correct.textContent = "√";
        const wrong = document.createElement("button");
        wrong.type = "button";
        wrong.className = "quick-result-button wrong";
        wrong.textContent = "×";
        correct.addEventListener("click", async () => {
          await recordFallbackDictationResult(item, true);
          toast("已记录正确。");
          await startFallbackDictation(mode);
          await refresh();
        });
        wrong.addEventListener("click", async () => {
          await recordFallbackDictationResult(item, false);
          toast("已记录错误，明天继续复习。");
          await startFallbackDictation(mode);
          await refresh();
        });
        actions.append(correct, wrong);
        row.append(title, ratio, actions);
        list.append(row);
      });
      panel.append(list);
    } catch (error) {
      toast(error.message || "读取背默内容失败。", true);
    }
  }

  async function directSave() {
    const kind = activeKind();
    const values = getInputs(kind);
    if (!values.length) {
      toast("请先输入内容。", true);
      return;
    }

    try {
      const existing = await getItems();
      const itemsToAdd = [];
      let skipped = 0;
      values.forEach((value) => {
        if (duplicates(existing, kind, value)) skipped += 1;
        else itemsToAdd.push(...buildItems(kind, value));
      });
      if (itemsToAdd.length) await addItems(itemsToAdd);
      await refresh();
      setStatus(`已直接保存 ${itemsToAdd.length} 条记录。${skipped ? `跳过 ${skipped} 条重复内容。` : ""}`);
      toast("已保存到本浏览器。");
    } catch (error) {
      toast(error.message || "保存失败。", true);
      setStatus(error.message || "保存失败。", true);
    }
  }

  async function saveRewardRedemption() {
    const productInput = $("#reward-redeem-product");
    const amountInput = $("#reward-redeem-amount");
    const product = String(productInput?.value || "").trim();
    const amount = Math.round((Number(amountInput?.value) || 0) * 100) / 100;
    if (!product || amount <= 0) {
      toast("请输入抵扣内容和正确金额。", true);
      return;
    }
    const settings = await getSettings();
    const redemption = {
      id: localId("redemption"),
      product,
      amount,
      createdAt: new Date().toISOString()
    };
    await saveSettings({
      rewardRedemptions: [
        ...(Array.isArray(settings.rewardRedemptions) ? settings.rewardRedemptions : []),
        redemption
      ]
    });
    if (productInput) productInput.value = "";
    toast("已记录抵扣。");
    await refresh();
  }

  function createManualCard(kind, value) {
    const results = $("#add-results");
    if (!results) return;
    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML = `
      <h3>填写卡：${value}</h3>
      <p class="muted">这是可选高级方式。日常使用可以直接点“直接保存”。</p>
      <div class="form-actions"></div>
    `;
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "按当前输入保存";
    save.addEventListener("click", async () => {
      await directSave();
      card.remove();
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.addEventListener("click", () => card.remove());
    card.querySelector(".form-actions").append(save, cancel);
    results.prepend(card);
  }

  function bindNavigation() {
    const navButtons = $all(".nav-button");
    const views = $all(".view");
    navButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const nextView = button.dataset.view;
        navButtons.forEach((item) => item.classList.toggle("active", item === button));
        views.forEach((view) => view.classList.toggle("active", view.id === `view-${nextView}`));
      });
    });
  }

  function bindModeButtons() {
    $all("[data-dictation-ui]").forEach((button) => {
      button.addEventListener("click", () => {
        $all("[data-dictation-ui]").forEach((item) => item.classList.toggle("active", item === button));
        const panel = $("#dictation-panel");
        if (panel) panel.textContent = button.dataset.dictationUi === "list" ? "请选择下方范围开始听写。" : "请选择下方范围开始背默。";
      });
    });

    $all("[data-start-mode]").forEach((button) => {
      button.addEventListener("click", () => startFallbackDictation(button.dataset.startMode || "all"));
    });

    $all("[data-library-filter]").forEach((button) => {
      button.addEventListener("click", async () => {
        libraryFilter = button.dataset.libraryFilter || "all";
        $all("[data-library-filter]").forEach((item) => item.classList.toggle("active", item === button));
        await refresh();
      });
    });
  }

  function bindAddTabs() {
    $all(".add-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const kind = tab.dataset.kind;
        $all(".add-tab").forEach((item) => item.classList.toggle("active", item === tab));
        $all(".add-panel").forEach((panel) => {
          const isActive = panel.dataset.kind === kind;
          panel.classList.toggle("active", isActive);
          panel.hidden = !isActive;
        });
      });
    });
  }

  function bindFallback() {
    if (window.__xiaokuiModuleReady || window.__xiaokuiStaticFallbackReady) return;
    window.__xiaokuiStaticFallbackReady = true;
    bindNavigation();
    bindAddTabs();
    bindModeButtons();

    const query = $("#query-button");
    const manual = $("#manual-button");
    const enrichAll = $("#library-enrich-all-button");
    if (query) query.textContent = "直接保存";
    if (manual) manual.textContent = "生成填写卡";
    enrichAll?.addEventListener("click", () => {
      toast("联网补全需要通过电脑后端版访问，静态 HTML 只能直接保存。", true);
    });

    $("#add-content-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await directSave();
    });

    $("#reward-redeem-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveRewardRedemption();
    });

    manual?.addEventListener("click", () => {
      const kind = activeKind();
      const values = getInputs(kind);
      if (!values.length) {
        toast("请先输入内容。", true);
        return;
      }
      $("#add-results")?.replaceChildren();
      values.forEach((value) => createManualCard(kind, value));
      setStatus("已生成填写卡。也可以直接使用“直接保存”。");
    });

    setStatus("浏览器静态版已启用：添加新词可以直接保存。以后可在电脑后端版联网补全。");
    refresh();
  }

  window.addEventListener("DOMContentLoaded", () => {
    window.setTimeout(bindFallback, 700);
  });
})();
