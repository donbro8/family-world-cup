/* ============================================================
   Family World Cup Challenge — client logic
   Loads data.json, computes cumulative + weekly scores, renders UI.
   No build step, no dependencies.
   ============================================================ */

// ---- Scoring constants (mirror plan.md §4) ----
const POINTS = { WIN: 3, DRAW: 1, GOAL: 1 };
const STAGE_RANK = { groups: 0, r16: 1, qf: 2, third: 3, sf: 3, final: 4, winner: 5 };
// Cumulative progression total for a team's furthest stage.
const PROGRESSION_TOTAL = { groups: 0, r16: 3, qf: 8, sf: 15, final: 25, winner: 40 };

const STAGE_LABEL = {
  groups: "Group Stage", r16: "Round of 16", qf: "Quarter Finals",
  sf: "Semi Finals", third: "3rd Place", final: "Final", winner: "Final",
};
const STAGE_ORDER = ["groups", "r16", "qf", "sf", "third", "final"];

const AVATAR_COLORS = [
  "oklch(72% 0.15 142)", "oklch(75% 0.14 85)", "oklch(70% 0.13 25)",
  "oklch(70% 0.12 250)", "oklch(72% 0.14 300)", "oklch(72% 0.13 190)",
  "oklch(74% 0.14 55)", "oklch(70% 0.13 160)", "oklch(72% 0.14 350)",
];

let DATA = null;
let activeParticipant = null;

// ---- Boot (browser only) ----
if (typeof window !== "undefined") {
  fetch("data.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((data) => { DATA = data; render(); })
    .catch((err) => {
      document.getElementById("loadState").textContent =
        "Couldn't load tournament data. Check that data.json is present.";
      console.error(err);
    });
}

// ---- Helpers ----
const $ = (id) => document.getElementById(id);

function progressionWeekly(stage) {
  // Returns { weekNumber: points } credited for reaching `stage`, per plan.md.
  const r = STAGE_RANK[stage] ?? 0;
  const w = {};
  if (r >= STAGE_RANK.r16) w[3] = 3;
  if (r >= STAGE_RANK.qf) w[4] = 5;
  if (r >= STAGE_RANK.sf) w[5] = 7;
  if (stage === "final" || stage === "winner") w[7] = (w[7] || 0) + 10;
  if (stage === "winner") w[7] = (w[7] || 0) + 15;
  return w;
}

function teamStats(teamName) {
  const team = DATA.teams[teamName] || { progressionStage: "groups", flag: "" };
  const stage = team.progressionStage || "groups";
  const stats = {
    name: teamName, flag: team.flag || "", stage,
    wins: 0, draws: 0, losses: 0, goals: 0,
    matchPoints: 0, progression: PROGRESSION_TOTAL[stage] ?? 0,
    weekly: {}, // week -> points
  };

  for (const m of DATA.matches || []) {
    if (m.status !== "completed" || m.score1 == null || m.score2 == null) continue;
    let mine, theirs;
    if (m.team1 === teamName) { mine = m.score1; theirs = m.score2; }
    else if (m.team2 === teamName) { mine = m.score2; theirs = m.score1; }
    else continue;

    let pts = mine * POINTS.GOAL;
    stats.goals += mine;
    if (mine > theirs) { stats.wins++; pts += POINTS.WIN; }
    else if (mine === theirs) { stats.draws++; pts += POINTS.DRAW; }
    else { stats.losses++; }

    stats.matchPoints += pts;
    addWeek(stats.weekly, m.week, pts);
  }

  // Progression points bucketed into the week their round occurs.
  for (const [wk, pts] of Object.entries(progressionWeekly(stage))) {
    addWeek(stats.weekly, Number(wk), pts);
  }
  return stats;
}

function addWeek(obj, week, pts) {
  if (!week || !pts) return;
  obj[week] = (obj[week] || 0) + pts;
}

function computeStandings() {
  const rows = Object.entries(DATA.participants).map(([key, p]) => {
    const a = teamStats(p.teams[0]);
    const b = teamStats(p.teams[1]);
    const weekly = {};
    for (const wk of [1, 2, 3, 4, 5, 6, 7]) weekly[wk] = (a.weekly[wk] || 0) + (b.weekly[wk] || 0);
    const total = Object.values(weekly).reduce((s, n) => s + n, 0);
    return {
      key, ...p, teamStats: [a, b], weekly, total,
      wins: a.wins + b.wins, draws: a.draws + b.draws, goals: a.goals + b.goals,
      progression: a.progression + b.progression,
    };
  });

  rows.sort((x, y) =>
    y.total - x.total || y.wins - x.wins || y.goals - x.goals || x.name.localeCompare(y.name)
  );
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

// ---- Avatar (image with graceful initials fallback) ----
function makeAvatar(participant, key, { leader = false, size } = {}) {
  const el = document.createElement("div");
  el.className = "avatar" + (leader ? " is-leader" : "");
  if (size) {
    el.style.width = el.style.height = size + "px";
    el.style.fontSize = Math.round(size * 0.42) + "px";
  }
  const initial = (participant.name || "?").trim().charAt(0).toUpperCase();
  el.textContent = initial;
  el.style.background = colorFor(key);

  if (participant.face) {
    const img = new Image();
    img.onload = () => {
      el.textContent = "";
      el.style.backgroundImage = `url("${participant.face}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
    };
    img.src = participant.face; // onerror → keep initials
  }
  return el;
}

function colorFor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function ownerOf(teamName) {
  for (const [key, p] of Object.entries(DATA.participants)) {
    if (p.teams.includes(teamName)) return { key, ...p };
  }
  return null;
}

let standingsByKey = {};

// ---- Render ----
function render() {
  $("loadState").hidden = true;
  const standings = computeStandings();
  standingsByKey = Object.fromEntries(standings.map((r) => [r.key, r]));
  renderLastUpdated();
  renderTicker(standings);
  renderNextMatch();
  renderLeaderboard(standings);
  renderMatches();
  renderPrizes();
}

function renderLastUpdated() {
  const el = $("lastUpdated");
  if (DATA.lastUpdated) {
    el.textContent = "Scores as of " + new Date(DATA.lastUpdated).toLocaleString(undefined, {
      dateStyle: "medium", timeStyle: "short",
    });
  } else {
    el.textContent = "Awaiting first automated update.";
  }
}

function renderTicker(standings) {
  if (!standings.length || standings[0].total === 0) return;
  $("leaderTicker").hidden = false;
  $("leaderTickerValue").textContent = `${standings[0].name} · ${standings[0].total} pts`;
}

function renderLeaderboard(standings) {
  $("leaderboardSection").hidden = false;
  const ol = $("leaderboard");
  ol.innerHTML = "";
  const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };

  standings.forEach((p) => {
    const li = document.createElement("li");
    li.className = `lb-row rank-${p.rank}`;
    li.dataset.participant = p.key;

    const rank = document.createElement("div");
    rank.className = "lb-rank";
    rank.innerHTML = medals[p.rank] ? `<span class="medal">${medals[p.rank]}</span>` : p.rank;

    const avatar = makeAvatar(p, p.key, { leader: p.rank === 1 });

    const main = document.createElement("div");
    main.className = "lb-main";
    const teams = p.teams.map((t) => {
      const ts = DATA.teams[t] || {};
      return `<span class="lb-team"><span class="flag">${ts.flag || "🏳️"}</span>${t}</span>`;
    }).join("");
    main.innerHTML = `<div class="lb-name">${p.name}</div><div class="lb-teams">${teams}</div>`;

    const score = document.createElement("div");
    score.className = "lb-score";
    score.innerHTML =
      `<div class="lb-points">${p.total}</div>` +
      `<div class="lb-breakdown">${p.wins}W · ${p.draws}D · ${p.goals}⚽ · ${p.progression} prog</div>`;

    li.append(rank, avatar, main, score);
    li.addEventListener("click", () => openParticipant(p.key));
    ol.appendChild(li);
  });
}

function renderNextMatch() {
  const section = $("nextMatchSection");
  const now = Date.now();
  const owned = (m) => ownerOf(m.team1) || ownerOf(m.team2);
  const byDate = (a, b) => new Date(a.date) - new Date(b.date);

  const candidates = (DATA.matches || []).filter(owned);
  const live = candidates.filter((m) => m.status === "live").sort(byDate);
  const upcoming = candidates
    .filter((m) => m.status === "upcoming" && new Date(m.date).getTime() >= now - 3 * 3600e3)
    .sort(byDate);

  const queue = [...live, ...upcoming].slice(0, 5);
  if (!queue.length) { section.hidden = true; return; }
  section.hidden = false;

  const wrap = $("nextMatch");
  wrap.innerHTML = "";
  queue.forEach((m, i) => wrap.appendChild(fixtureCard(m, i === 0)));
}

function fixtureCard(m, isNext) {
  const card = document.createElement("article");
  card.className = "fixture" + (isNext ? " is-next" : "");
  card.dataset.team1 = m.team1;
  card.dataset.team2 = m.team2;

  const live = m.status === "live";
  const badge = isNext
    ? `<span class="fx-badge ${live ? "live" : ""}">${live ? "● Live" : "Next"}</span>`
    : "";
  const meta = document.createElement("div");
  meta.className = "fx-meta";
  meta.innerHTML =
    `${badge}<span class="fx-stage">${STAGE_LABEL[m.stage] || ""}</span>` +
    `<span class="fx-dot">·</span><span class="fx-time">${formatKickoff(m)}</span>`;

  const body = document.createElement("div");
  body.className = "fx-body";
  body.append(teamCol(m.team1, false), vsCell(), teamCol(m.team2, true));

  card.append(meta, body);
  return card;
}

function vsCell() {
  const el = document.createElement("div");
  el.className = "fx-vs";
  el.textContent = "VS";
  return el;
}

function teamCol(teamName, right) {
  const ts = DATA.teams[teamName] || {};
  const owner = ownerOf(teamName);
  const col = document.createElement("div");
  col.className = "fx-team" + (right ? " right" : "");

  const head = document.createElement("div");
  head.className = "fx-head";
  head.innerHTML = `<span class="fx-flag">${ts.flag || "🏳️"}</span><span class="fx-name">${teamName}</span>`;

  const ownerEl = document.createElement("div");
  ownerEl.className = "fx-owner" + (owner ? "" : " unclaimed");
  if (owner) {
    ownerEl.append(makeAvatar(owner, owner.key, { size: 26 }));
    const nm = document.createElement("span");
    nm.textContent = owner.name;
    ownerEl.append(nm);
  } else {
    ownerEl.innerHTML = `<span class="fx-unclaimed-dot">?</span><span>Unclaimed</span>`;
  }

  col.append(head, ownerEl);
  return col;
}

function formatKickoff(match) {
  if (match.status === "live") return "LIVE NOW";
  const d = new Date(match.date);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

let activeStage = "all";
function renderMatches() {
  const matches = (DATA.matches || []).filter((m) => ownerOf(m.team1) || ownerOf(m.team2));
  if (!matches.length) { $("matchesSection").hidden = true; return; }
  $("matchesSection").hidden = false;

  const stagesPresent = STAGE_ORDER.filter((s) => matches.some((m) => m.stage === s));
  const tabs = $("stageTabs");
  tabs.innerHTML = "";
  ["all", ...stagesPresent].forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (s === activeStage ? " is-active" : "");
    btn.textContent = s === "all" ? "All" : STAGE_LABEL[s];
    btn.setAttribute("role", "tab");
    btn.addEventListener("click", () => { activeStage = s; renderMatches(); });
    tabs.appendChild(btn);
  });

  const list = $("matchList");
  list.innerHTML = "";
  matches
    .filter((m) => activeStage === "all" || m.stage === activeStage)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((m) => list.appendChild(matchRow(m)));

  applyActiveHighlight();
}

function matchRow(m) {
  const li = document.createElement("li");
  li.className = "match-row";
  li.dataset.team1 = m.team1;
  li.dataset.team2 = m.team2;
  const f1 = (DATA.teams[m.team1] || {}).flag || "🏳️";
  const f2 = (DATA.teams[m.team2] || {}).flag || "🏳️";

  const center = m.status === "completed"
    ? `<div class="m-score">${m.score1} – ${m.score2}</div><div class="m-status">Full Time</div>`
    : m.status === "live"
      ? `<div class="m-score">${m.score1 ?? 0} – ${m.score2 ?? 0}</div><div class="m-status live">● Live</div>`
      : `<div class="m-date">${formatKickoff(m)}</div><div class="m-status">Upcoming</div>`;

  li.innerHTML =
    `<div class="m-team"><span class="flag">${f1}</span><span class="nm">${m.team1}</span></div>` +
    `<div class="m-center">${center}</div>` +
    `<div class="m-team right"><span class="nm">${m.team2}</span><span class="flag">${f2}</span></div>`;
  return li;
}

function renderPrizes() {
  if (!DATA.prizes?.length) { return; }
  $("prizesSection").hidden = false;
  const ordinal = { 1: "1st Place", 2: "2nd Place", 3: "3rd Place" };
  $("prizes").innerHTML = DATA.prizes.map((p) =>
    `<div class="prize"><span class="pl-icon">${p.icon}</span>` +
    `<span class="pl-place">${ordinal[p.place] || p.place}</span>` +
    `<span class="pl-reward">${p.reward}</span></div>`
  ).join("");

  const toggle = $("prizesToggle"), body = $("prizesBody");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    body.hidden = open;
  });
}

// ---- Interaction: open a participant's profile (large photo + stats) ----
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function openParticipant(key) {
  const p = standingsByKey[key];
  if (!p) return;

  // highlight their teams in the lists behind the modal
  activeParticipant = key;
  document.querySelectorAll(".lb-row").forEach((el) =>
    el.classList.toggle("is-active", el.dataset.participant === key));
  applyActiveHighlight();

  const content = $("modalContent");
  content.innerHTML = "";

  const photo = makeAvatar(p, key, { leader: p.rank === 1 });
  photo.classList.add("profile-photo");

  const head = document.createElement("div");
  head.className = "profile-head";
  head.innerHTML =
    `<div class="profile-rank">${MEDALS[p.rank] || "#" + p.rank}</div>` +
    `<h3 id="modalName" class="profile-name">${p.name}</h3>` +
    `<div class="profile-total"><span>${p.total}</span> pts</div>` +
    `<div class="profile-breakdown">${p.wins}W · ${p.draws}D · ${p.goals} goals · ${p.progression} progression</div>`;

  const teams = document.createElement("div");
  teams.className = "profile-teams";
  p.teamStats.forEach((ts) => {
    const pts = ts.matchPoints + ts.progression;
    const row = document.createElement("div");
    row.className = "profile-team";
    row.innerHTML =
      `<span class="pt-flag">${ts.flag || "🏳️"}</span>` +
      `<span class="pt-name">${ts.name}</span>` +
      `<span class="pt-stage">${STAGE_LABEL[ts.stage] || ""}</span>` +
      `<span class="pt-pts">${pts} pts</span>`;
    teams.appendChild(row);
  });

  content.append(photo, head, teams);
  const modal = $("personModal");
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("open"));
}

function closeModal() {
  const modal = $("personModal");
  modal.classList.remove("open");
  modal.hidden = true;
  activeParticipant = null;
  document.querySelectorAll(".lb-row").forEach((el) => el.classList.remove("is-active"));
  applyActiveHighlight();
}

// wire up close interactions (backdrop click, × button, Esc)
if (typeof window !== "undefined") {
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("personModal").hidden) closeModal();
  });
}

function applyActiveHighlight() {
  const teams = activeParticipant ? DATA.participants[activeParticipant].teams : [];
  document.querySelectorAll(".match-row, .fixture").forEach((row) => {
    const hit = teams.includes(row.dataset.team1) || teams.includes(row.dataset.team2);
    row.classList.toggle("highlight", hit);
  });
}

// ---- Node test hook (no effect in the browser) ----
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    setData: (d) => { DATA = d; },
    teamStats, computeStandings, progressionWeekly, PROGRESSION_TOTAL,
  };
}
