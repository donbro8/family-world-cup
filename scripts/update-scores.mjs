#!/usr/bin/env node
/* ============================================================
   update-scores.mjs
   Rebuilds data.json's matches[] and teams[].progressionStage from
   the football-data.org API. Tracks ONLY our owned teams' fixtures.
   No manual fixture entry, no hand-entered IDs (name-alias matching).

   Run by .github/workflows/update-scores.yml. Locally:
     FOOTBALL_API_KEY=xxxx node scripts/update-scores.mjs
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data.json");

const API_KEY = process.env.FOOTBALL_API_KEY;
const COMPETITION = process.env.COMPETITION || "WC"; // football-data.org code for the World Cup
const API_URL = `https://api.football-data.org/v4/competitions/${COMPETITION}/matches`;

// ---- stage / week / status maps (football-data.org → our schema) ----
const STAGE_MAP = {
  GROUP_STAGE: "groups", LAST_32: "r32", LAST_16: "r16", QUARTER_FINALS: "qf",
  SEMI_FINALS: "sf", THIRD_PLACE: "third", FINAL: "final",
};
const STAGE_RANK = { groups: 0, r32: 1, r16: 2, qf: 3, sf: 4, third: 4, final: 5, winner: 6 };
const RANK_STAGE = { 0: "groups", 1: "r32", 2: "r16", 3: "qf", 4: "sf", 5: "final" };

function weekFor(stage, matchday) {
  switch (stage) {
    case "groups": return Number(matchday) >= 3 ? 2 : 1;
    case "r32": return 3;
    case "r16": return 3;
    case "qf": return 4;
    case "sf": return 5;
    case "third": return 6;
    case "final": return 7;
    default: return 1;
  }
}
function statusFor(s) {
  if (s === "FINISHED") return "completed";
  if (s === "IN_PLAY" || s === "PAUSED") return "live";
  return "upcoming";
}

// ---- name matching (accent/punctuation-insensitive + aliases) ----
const ALIASES = {
  "Ivory Coast": ["cote divoire", "cote d ivoire"],
  "Iran": ["ir iran", "islamic republic of iran"],
  "South Korea": ["korea republic"],
  "Netherlands": ["holland"],
  "United States": ["usa", "united states of america"],
};
const norm = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");

function buildLookup(teamNames) {
  const map = new Map();
  for (const name of teamNames) {
    map.set(norm(name), name);
    for (const alias of ALIASES[name] || []) map.set(norm(alias), name);
  }
  return map;
}

async function main() {
  if (!API_KEY) {
    console.error("FOOTBALL_API_KEY is not set. Aborting (no changes made).");
    process.exit(1);
  }

  const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
  const ownedNames = Object.keys(data.teams);
  const lookup = buildLookup(ownedNames);

  // ---- fetch ----
  const res = await fetch(API_URL, { headers: { "X-Auth-Token": API_KEY } });
  if (!res.ok) {
    console.error(`API error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const payload = await res.json();
  const apiMatches = payload.matches || [];
  console.log(`Fetched ${apiMatches.length} ${COMPETITION} matches from the API.`);

  const resolve = (apiName) => {
    const hit = lookup.get(norm(apiName));
    if (!hit && apiName) unresolved.add(apiName);
    return hit || null;
  };
  const unresolved = new Set();

  // ---- build matches[] (owned fixtures only) + track furthest stage ----
  const matches = [];
  const furthestRank = Object.fromEntries(ownedNames.map((n) => [n, 0]));
  const finalWinners = new Set();

  for (const m of apiMatches) {
    const stage = STAGE_MAP[m.stage];
    if (!stage) continue;
    const t1 = resolve(m.homeTeam?.name);
    const t2 = resolve(m.awayTeam?.name);
    if (!t1 && !t2) continue; // not our competition

    const score1 = m.score?.fullTime?.home ?? null;
    const score2 = m.score?.fullTime?.away ?? null;
    const status = statusFor(m.status);

    matches.push({
      id: m.id,
      stage,
      week: weekFor(stage, m.matchday),
      date: m.utcDate,
      team1: t1 || m.homeTeam?.name || "TBD",
      team2: t2 || m.awayTeam?.name || "TBD",
      score1, score2, status,
    });

    // furthest stage reached = appearing in a round's match
    const rank = STAGE_RANK[stage];
    if (t1) furthestRank[t1] = Math.max(furthestRank[t1], rank);
    if (t2) furthestRank[t2] = Math.max(furthestRank[t2], rank);

    // champion special-case: winner of a FINISHED final
    if (stage === "final" && status === "completed" && score1 != null && score2 != null) {
      if (score1 !== score2) {
        const champ = score1 > score2 ? t1 : t2;
        if (champ) finalWinners.add(champ);
      }
    }
  }

  matches.sort((a, b) => new Date(a.date) - new Date(b.date));

  // ---- apply progression stages ----
  const updatedTeams = {};
  for (const [name, team] of Object.entries(data.teams)) {
    let stage = RANK_STAGE[furthestRank[name]] || "groups";
    if (finalWinners.has(name)) stage = "winner";
    updatedTeams[name] = { ...team, progressionStage: stage };
  }

  // ---- only write/commit if something actually changed ----
  const next = { ...data, teams: updatedTeams, matches };
  const strip = (o) => JSON.stringify({ ...o, lastUpdated: null });
  if (strip(next) === strip(data)) {
    console.log("No changes detected — leaving data.json untouched.");
    logUnresolved(unresolved);
    return;
  }

  next.lastUpdated = new Date().toISOString();
  await writeFile(DATA_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(`Updated data.json: ${matches.length} owned-team fixtures.`);
  logUnresolved(unresolved);
}

function logUnresolved(set) {
  if (set.size) {
    console.warn("Unresolved API team names (skipped, add to ALIASES if one is ours):");
    for (const n of set) console.warn("  - " + n);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
