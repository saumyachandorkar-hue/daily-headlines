const listEl = document.getElementById("stories");
const filtersEl = document.getElementById("filters");
const dateEl = document.getElementById("page-date");
const updatedEl = document.getElementById("updated");
const countEl = document.getElementById("count");
const messageEl = document.getElementById("message");

let stories = [];
let active = "all";

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

function renderFilters() {
  const counts = new Map();
  stories.forEach((s) =>
    (s.topics || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1))
  );
  const topics = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  filtersEl.replaceChildren();
  ["all", ...topics].forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = t === "all" ? "All stories" : pretty(t);
    b.setAttribute("aria-pressed", String(t === active));
    b.addEventListener("click", () => {
      active = t;
      renderFilters();
      renderStories();
    });
    filtersEl.append(b);
  });
}

function renderStories() {
  const shown =
    active === "all" ? stories : stories.filter((s) => (s.topics || []).includes(active));

  listEl.replaceChildren();
  shown.forEach((s) => {
    const li = document.createElement("li");
    li.className = "story";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = s.rank;

    const body = document.createElement("div");

    const h2 = document.createElement("h2");
    const href = safeLink(s.link);
    if (href) {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = s.title;
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
    tags.textContent = (s.topics || []).map(pretty).join(", ");
    meta.append(tags);

    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = s.summary || "";

    body.append(h2, meta, summary);
    li.append(rank, body);
    listEl.append(li);
  });

  countEl.textContent = `Showing ${shown.length} of ${stories.length} stories`;
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
  try {
    const res = await fetch(`headlines.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    stories = Array.isArray(data.stories) ? data.stories : [];
    dateEl.textContent = data.date ? formatDate(data.date) : "Today's stories";
    updatedEl.textContent = data.updated ? formatUpdated(data.updated) : "";

    if (stories.length === 0) {
      showMessage("No stories yet. The next daily run will add them.");
      countEl.textContent = "";
      return;
    }
    renderFilters();
    renderStories();
  } catch (err) {
    dateEl.textContent = "Headlines unavailable";
    showMessage(
      "Could not load the headlines. Check that headlines.json sits next to index.html, and open the page through a web server instead of double-clicking the file."
    );
  }
}

load();
