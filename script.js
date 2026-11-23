const STORE_KEY = "dh-prefs-v1";
const WEIGHT_MIN = -6;
const WEIGHT_MAX = 10;
const TOPIC_FACTOR = 0.6;
const DAILY_DECAY = 0.9;
const PAGE_SIZE = 10;

const $ = (id) => document.getElementById(id);
const listEl = $("stories");
const filtersEl = $("filters");
const dateEl = $("page-date");
const updatedEl = $("updated");
const countEl = $("count");
const statusEl = $("status");
const messageEl = $("message");
const viewEl = $("view");
const moreEl = $("more");
const moreBtn = $("more-btn");
const onboardingEl = $("onboarding");
const optionsEl = $("interest-options");

let stories = [];
let activeTopic = "all";
let view = "top";
let visible = PAGE_SIZE;
let canSave = true;
let prefs = { weights: {}, updated: today(), onboarded: false };
const opened = new Set();

function today() {
  return new Date().toISOString().slice(0, 10);
}

const pretty = (tag) => String(tag).replace(/-/g, " ");

function safeLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch (e) {
    return null;
  }
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.hidden = false;
}

/* ---------- saved preferences (this browser only) ---------- */

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.weights === "object" && p.weights) {
        prefs = { weights: p.weights, updated: p.updated || today(), onboarded: !!p.onboarded };
      }
    }
  } catch (e) {
    canSave = false;
  }
  decayPrefs();
}

function savePrefs() {
  if (!canSave) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch (e) {
    canSave = false;
  }
}

function decayPrefs() {
  const gap = Math.round((Date.parse(today()) - Date.parse(prefs.updated)) / 86400000);
  const days = Math.min(30, Math.max(0, gap)) || 0;
  if (days > 0) {
    Object.keys(prefs.weights).forEach((t) => {
      const w = prefs.weights[t] * Math.pow(DAILY_DECAY, days);
      if (Math.abs(w) < 0.2) delete prefs.weights[t];
      else prefs.weights[t] = w;
    });
  }
  prefs.updated = today();
  savePrefs();
}

function bump(topics, amount) {
  (topics || []).forEach((t) => {
    const next = (prefs.weights[t] || 0) + amount;
    prefs.weights[t] = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, next));
  });
  savePrefs();
}

function hasPrefs() {
  return Object.values(prefs.weights).some((w) => Math.abs(w) >= 0.2);
}

/* ---------- ordering ---------- */

function personalScore(s) {
  const boost = s.topics.reduce((sum, t) => sum + (prefs.weights[t] || 0), 0);
  return s.score + TOPIC_FACTOR * boost;
}

function ordered() {
  const list = stories.slice();
  if (view === "you") {
    list.sort((a, b) => personalScore(b) - personalScore(a) || a.rank - b.rank);
  } else {
    list.sort((a, b) => a.rank - b.rank);
  }
  return list;
}

function topicsByFrequency() {
  const counts = new Map();
  stories.forEach((s) => s.topics.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/* ---------- rendering ---------- */

function setViewStatus(extra) {
  const base =
    view === "you"
      ? "Ordered by the topics you chose and the stories you open. Saved only in this browser."
      : "Ranked by the AI editor. The same order for everyone.";
  statusEl.textContent = extra ? `${extra} ${base}` : base;
}

function renderViewButtons() {
  viewEl.querySelectorAll("button[data-view]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === view));
  });
}

function renderFilters() {
  filtersEl.replaceChildren();
  ["all", ...topicsByFrequency()].forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t === "all" ? "All stories" : pretty(t);
    b.setAttribute("aria-pressed", String(t === activeTopic));
    b.addEventListener("click", () => {
      activeTopic = t;
      visible = PAGE_SIZE;
      renderFilters();
      renderStories();
    });
    filtersEl.append(b);
  });
}

function onOpen(s) {
  if (opened.has(s.link)) return;
  opened.add(s.link);
  bump(s.topics, 1);
}

function feedback(s, amount) {
  if (s.topics.length === 0) {
    setViewStatus("This story has no topic tags, so nothing was learned.");
    return;
  }
  bump(s.topics, amount);
  const names = s.topics.map(pretty).join(", ");
  const note =
    amount > 0
      ? `Got it. You will see more about ${names}.`
      : `Got it. You will see less about ${names}.`;
  if (view === "you") {
    renderStories();
    setViewStatus(note);
  } else {
    setViewStatus(`${note} Switch to For you to see the change.`);
  }
}

function storyItem(s, position) {
  const li = document.createElement("li");
  li.className = "story";

  const rank = document.createElement("span");
  rank.className = "rank";
  rank.textContent = position;

  const body = document.createElement("div");

  const h2 = document.createElement("h2");
  const href = safeLink(s.link);
  if (href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = s.title;
    a.addEventListener("click", () => onOpen(s));
    a.addEventListener("auxclick", () => onOpen(s));
    h2.append(a);
  } else {
    h2.textContent = s.title;
  }

  const meta = document.createElement("p");
  meta.className = "meta";
  if (s.source) {
    const src = document.createElement("span");
    src.className = "source";
    src.textContent = s.source;
    meta.append(src);
  }
  const tags = document.createElement("span");
  tags.textContent = s.topics.map(pretty).join(", ");
  meta.append(tags);

  if (view === "you") {
    const liked = s.topics.filter((t) => (prefs.weights[t] || 0) >= 1);
    if (liked.length) {
      const why = document.createElement("span");
      why.className = "why";
      why.textContent = `Matches your interest in ${liked.map(pretty).join(", ")}`;
      meta.append(why);
    }
  }

  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent = s.summary || "";

  const actions = document.createElement("div");
  actions.className = "story-actions";
  const more = document.createElement("button");
  more.type = "button";
  more.className = "link";
  more.textContent = "More like this";
  more.addEventListener("click", () => feedback(s, 2));
  const less = document.createElement("button");
  less.type = "button";
  less.className = "link";
  less.textContent = "Less like this";
  less.addEventListener("click", () => feedback(s, -2));
  actions.append(more, less);

  body.append(h2, meta, summary, actions);
  li.append(rank, body);
  return li;
}

function renderStories() {
  const pool = ordered().filter((s) => activeTopic === "all" || s.topics.includes(activeTopic));
  const shown = pool.slice(0, visible);

  listEl.replaceChildren();
  shown.forEach((s, i) => listEl.append(storyItem(s, i + 1)));

  countEl.textContent = pool.length
    ? `Showing ${shown.length} of ${pool.length} stories`
    : "No stories for this topic today.";

  moreEl.hidden = shown.length >= pool.length;
  if (!moreEl.hidden) {
    moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, pool.length - shown.length)} more`;
  }
}

function render() {
  renderViewButtons();
  renderFilters();
  renderStories();
}

/* ---------- interests panel ---------- */

function openOnboarding() {
  optionsEl.replaceChildren();
  topicsByFrequency().forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = pretty(t);
    b.dataset.topic = t;
    b.setAttribute("aria-pressed", String((prefs.weights[t] || 0) >= 2));
    b.addEventListener("click", () => {
      b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    });
    optionsEl.append(b);
  });
  onboardingEl.hidden = false;
}

function saveOnboarding() {
  optionsEl.querySelectorAll("button").forEach((b) => {
    const t = b.dataset.topic;
    if (b.getAttribute("aria-pressed") === "true") {
      prefs.weights[t] = Math.max(prefs.weights[t] || 0, 3);
    } else if ((prefs.weights[t] || 0) > 0) {
      delete prefs.weights[t];
    }
  });
  prefs.onboarded = true;
  savePrefs();
  onboardingEl.hidden = true;
  view = hasPrefs() ? "you" : "top";
  visible = PAGE_SIZE;
  render();
  setViewStatus(hasPrefs() ? "Saved." : "");
}

function skipOnboarding() {
  prefs.onboarded = true;
  savePrefs();
  onboardingEl.hidden = true;
}

function resetPrefs() {
  prefs = { weights: {}, updated: today(), onboarded: false };
  savePrefs();
  view = "top";
  visible = PAGE_SIZE;
  render();
  setViewStatus("Your interests were cleared.");
}

viewEl.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  view = b.dataset.view;
  visible = PAGE_SIZE;
  render();
  if (view === "you" && !hasPrefs()) {
    setViewStatus("You have not chosen interests yet, so this matches Top picks until you do.");
  } else {
    setViewStatus();
  }
});

moreBtn.addEventListener("click", () => {
  visible += PAGE_SIZE;
  renderStories();
});

$("edit-interests").addEventListener("click", openOnboarding);
$("onb-save").addEventListener("click", saveOnboarding);
$("onb-skip").addEventListener("click", skipOnboarding);
$("reset").addEventListener("click", resetPrefs);

/* ---------- loading ---------- */

function dataFile() {
  const q = new URLSearchParams(location.search).get("data");
  return q && /^[\w.-]+\.json$/.test(q) ? q : "headlines.json";
}

function normalize(s, i) {
  return {
    ...s,
    rank: Number(s.rank) || i + 1,
    score: Number(s.score) || 0,
    topics: Array.isArray(s.topics) ? s.topics : [],
  };
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatUpdated(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    "Updated " +
    d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }) +
    " IST"
  );
}

async function load() {
  loadPrefs();
  try {
    const res = await fetch(`${dataFile()}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    stories = (Array.isArray(data.stories) ? data.stories : []).map(normalize);
    dateEl.textContent = data.date ? formatDate(data.date) : "Today's stories";
    updatedEl.textContent = data.updated ? formatUpdated(data.updated) : "";

    if (stories.length === 0) {
      showMessage("No stories yet. The next daily run will add them.");
      return;
    }

    view = hasPrefs() ? "you" : "top";
    render();
    setViewStatus(canSave ? "" : "This browser will not let the page save your interests.");
    if (!prefs.onboarded) openOnboarding();
  } catch (err) {
    dateEl.textContent = "Headlines unavailable";
    showMessage(
      "Could not load the headlines. Check that headlines.json sits next to index.html, and open the page through a web server instead of double-clicking the file."
    );
  }
}

load();
