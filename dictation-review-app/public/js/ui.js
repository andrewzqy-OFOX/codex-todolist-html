import { addDays, toLocalDate } from "./date-utils.js";

export function setupNavigation() {
  const navButtons = document.querySelectorAll(".nav-button");
  const views = document.querySelectorAll(".view");

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view;
      navButtons.forEach((item) => item.classList.toggle("active", item === button));
      views.forEach((view) => view.classList.toggle("active", view.id === `view-${nextView}`));
    });
  });
}

export function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("danger", isError);
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

export function renderTodaySummary(container, statsOrItems) {
  const stats = Array.isArray(statsOrItems)
    ? {
        englishCount: 0,
        chineseCount: 0,
        poemCount: 0,
        overdueCount: 0,
        totalCount: statsOrItems.length
      }
    : statsOrItems;

  container.replaceChildren();
  const rows = [
    ["English Words", stats.englishCount || 0],
    ["中文生词", stats.chineseCount || 0],
    ["古诗词", stats.poemCount || 0],
    ["逾期任务", stats.overdueCount || 0],
    ["全部背默", stats.totalCount || 0]
  ];

  rows.forEach(([label, value]) => {
    const cell = document.createElement("div");
    cell.className = "stat-card";
    if (label === "全部背默") cell.classList.add("total-stat");
    const number = document.createElement("div");
    number.className = "stat-value";
    number.textContent = String(value);
    const caption = document.createElement("div");
    caption.className = "stat-label";
    caption.textContent = label;
    cell.append(number, caption);
    container.append(cell);
  });
}

function itemTypeLabel(item) {
  if (item.type === "english_word") return "English Words";
  if (item.type === "chinese_phrase") return "中文生词";
  if (item.type === "poem") return "古诗词";
  if (item.type === "poem_line") return "古诗句";
  return item.type || "学习内容";
}

function trackList(item) {
  const tracks = [];
  if (item.spellingTrack) tracks.push(item.spellingTrack);
  if (item.phoneticTrack) tracks.push(item.phoneticTrack);
  if (item.wholeItemTrack) tracks.push(item.wholeItemTrack);
  for (const track of Object.values(item.characterTracks || {})) {
    tracks.push(track);
  }
  return tracks;
}

function isMasteredItem(item) {
  const tracks = trackList(item).filter(Boolean);
  if (item.type === "poem") return false;
  return tracks.length > 0 && tracks.every((track) => track.status === "mastered" || track.active === false);
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

function daysUntil(dateText, today = toLocalDate()) {
  if (!dateText) return { label: "未安排", className: "" };
  const dayMs = 24 * 60 * 60 * 1000;
  const todayTime = Date.parse(`${today}T00:00:00`);
  const targetTime = Date.parse(`${dateText}T00:00:00`);
  if (Number.isNaN(targetTime) || Number.isNaN(todayTime)) return { label: dateText, className: "" };
  const diff = Math.round((targetTime - todayTime) / dayMs);
  if (diff < 0) return { label: `逾期 ${Math.abs(diff)} 天`, className: "danger" };
  if (diff === 0) return { label: "今天复习", className: "due" };
  return { label: `${diff} 天后复习`, className: "" };
}

export function summarizeLearned(items) {
  const english = items.filter((item) => item.type === "english_word" && isMasteredItem(item)).length;
  const chinese = items.filter((item) => item.type === "chinese_phrase" && isMasteredItem(item)).length;
  const poem = items.filter((item) => item.type === "poem_line" && isMasteredItem(item)).length;

  return { english, chinese, poem, total: english + chinese + poem };
}

function libraryCategory(item) {
  if (item.type === "english_word") return "english";
  if (item.type === "chinese_phrase") return "chinese";
  if (item.type === "poem_line") return "poem";
  return null;
}

function emptyLibraryBucket(label) {
  return {
    label,
    total: 0,
    mastered: 0,
    archived: 0,
    recentCorrect: 0,
    recentTotal: 0,
    recentAccuracy: 0
  };
}

export function summarizeLibraryStats(items, reviewEvents = [], today = toLocalDate()) {
  const buckets = {
    all: emptyLibraryBucket("全部内容"),
    english: emptyLibraryBucket("English Words"),
    chinese: emptyLibraryBucket("中文生词"),
    poem: emptyLibraryBucket("古诗词")
  };
  const itemCategoryById = new Map();

  for (const item of items) {
    const category = libraryCategory(item);
    if (!category) continue;
    itemCategoryById.set(item.id, category);
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
  }

  const startDate = addDays(today, -6);
  for (const event of reviewEvents) {
    if (!event?.date || event.date < startDate || event.date > today) continue;
    const category = itemCategoryById.get(event.itemId);
    if (!category) continue;
    buckets[category].recentTotal += 1;
    buckets.all.recentTotal += 1;
    if (event.result === "correct") {
      buckets[category].recentCorrect += 1;
      buckets.all.recentCorrect += 1;
    }
  }

  for (const bucket of Object.values(buckets)) {
    bucket.recentAccuracy = bucket.recentTotal ? Math.round((bucket.recentCorrect / bucket.recentTotal) * 100) : 0;
  }

  return buckets;
}

export function renderLibrarySummary(container, items, reviewEvents = [], today = toLocalDate()) {
  if (!container) return;
  const stats = summarizeLibraryStats(items, reviewEvents, today);
  const rows = [stats.all, stats.english, stats.chinese, stats.poem];
  container.replaceChildren();

  for (const row of rows) {
    const card = document.createElement("article");
    card.className = "library-summary-card";
    card.innerHTML = `
      <strong>${row.label}</strong>
      <div class="library-summary-main">${row.total}</div>
      <div class="library-summary-meta">
        <span>已熟悉 ${row.mastered}</span>
        <span>已归档 ${row.archived}</span>
        <span>近7天 ${row.recentTotal ? `${row.recentAccuracy}%` : "暂无"}</span>
      </div>
    `;
    container.append(card);
  }
}

export function renderLearnedSummary(container, items) {
  if (!container) return;
  const stats = summarizeLearned(items);
  const rows = [
    ["English Words", stats.english],
    ["中文生词", stats.chinese],
    ["古诗句", stats.poem],
    ["合计", stats.total]
  ];
  container.replaceChildren();
  rows.forEach(([label, value]) => {
    const cell = document.createElement("div");
    cell.className = "learned-summary-card";
    cell.append(
      Object.assign(document.createElement("strong"), { textContent: String(value) }),
      Object.assign(document.createElement("span"), { textContent: label })
    );
    container.append(cell);
  });
}

export function renderLibrary(container, items, onArchive) {
  container.replaceChildren();

  if (!items.length) {
    container.textContent = "学习库暂无已确认内容。";
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "library-item";

    const content = document.createElement("div");
    content.className = "library-main";
    const title = document.createElement("strong");
    title.textContent = item.text;
    const meta = document.createElement("div");
    meta.className = "library-meta";
    const extra = item.type === "poem_line" ? ` · ${item.title || item.payload?.title || ""}` : "";
    meta.textContent = `${itemTypeLabel(item)}${extra}`;
    content.append(title, meta);

    const accuracy = itemAccuracy(item);
    const review = daysUntil(item.nextReviewDate);
    const stats = document.createElement("div");
    stats.className = "library-card-stats";
    const percent = document.createElement("div");
    percent.className = "library-accuracy";
    percent.textContent = `${accuracy.percent}%`;
    const detail = document.createElement("div");
    detail.className = "library-review-detail";
    detail.innerHTML = `
      <span class="${review.className}">${review.label}</span>
      <span>正确 ${accuracy.correct}/${accuracy.total}</span>
    `;
    stats.append(percent, detail);

    const actions = document.createElement("div");
    actions.className = "library-actions";
    const archiveButton = document.createElement("button");
    archiveButton.type = "button";
    archiveButton.className = "icon-button archive-icon-button";
    archiveButton.setAttribute("aria-label", "归档");
    archiveButton.title = "归档";
    archiveButton.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
        <path d="M4 7.5h16l-1.2 11H5.2L4 7.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M6.5 5h11l1 2.5h-13L6.5 5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M9 11h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;
    archiveButton.addEventListener("click", () => onArchive(item.id));
    actions.append(archiveButton);

    row.append(content, stats, actions);
    container.append(row);
  }
}
