#!/usr/bin/env node
/**
 * Refresh official league results + remaining fixtures overlay.
 *
 * Runs via `npm run data:results` and on Vite server/build start.
 * Fetches Premier League / Championship / League One scores AND upcoming
 * fixtures from TheFishy into public/data/officialResultsOverlay.json.
 *
 * Played overlay rows drive tables; unplayed overlay rows are the real
 * remaining calendar so the in-game schedule cannot invent wrong pairings.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOOTBALL_JSON_BASE,
  FOOTBALL_JSON_FILES,
  mapFootballJsonMatches,
  normalizeClubName,
} from "./lib/footballJsonResults.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "public", "data", "officialResultsOverlay.json");
const teamsFile = join(root, "public", "data", "teams.json");

const COMPETITIONS = [
  { table: 1, competition: "Premier League" },
  { table: 2, competition: "Championship" },
  { table: 3, competition: "League One" },
];

/** Fishy short labels → formal club names used in teams.json */
const NAME_ALIASES = {
  plymouth: "Plymouth Argyle",
  argyle: "Plymouth Argyle",
  barnsley: "Barnsley",
  blackpool: "Blackpool",
  bradford: "Bradford City",
  bromley: "Bromley",
  burton: "Burton Albion",
  "burton albion": "Burton Albion",
  cambridge: "Cambridge United",
  "cambridge utd": "Cambridge United",
  "cambridge u": "Cambridge United",
  doncaster: "Doncaster Rovers",
  huddersfield: "Huddersfield Town",
  leicester: "Leicester City",
  "leyton orient": "Leyton Orient",
  luton: "Luton Town",
  mansfield: "Mansfield Town",
  "mk dons": "Milton Keynes Dons",
  "milton keynes dons": "Milton Keynes Dons",
  "notts co": "Notts County",
  "notts county": "Notts County",
  oxford: "Oxford United",
  "oxford utd": "Oxford United",
  peterborough: "Peterborough United",
  reading: "Reading",
  "sheff wed": "Sheffield Wednesday",
  "sheffield wed": "Sheffield Wednesday",
  stevenage: "Stevenage",
  stockport: "Stockport County",
  wigan: "Wigan Athletic",
  wycombe: "Wycombe Wanderers",
  "afc wimbledon": "AFC Wimbledon",
  wimbledon: "AFC Wimbledon",
  birmingham: "Birmingham City",
  blackburn: "Blackburn Rovers",
  bolton: "Bolton Wanderers",
  "bristol city": "Bristol City",
  burnley: "Burnley",
  cardiff: "Cardiff City",
  charlton: "Charlton Athletic",
  derby: "Derby County",
  lincoln: "Lincoln City",
  "lincoln city": "Lincoln City",
  middlesbrough: "Middlesbrough",
  millwall: "Millwall",
  norwich: "Norwich City",
  portsmouth: "Portsmouth",
  preston: "Preston North End",
  qpr: "Queens Park Rangers",
  "queens park rangers": "Queens Park Rangers",
  "sheff utd": "Sheffield United",
  "sheffield utd": "Sheffield United",
  southampton: "Southampton",
  stoke: "Stoke City",
  swansea: "Swansea City",
  watford: "Watford",
  "west brom": "West Bromwich Albion",
  "west ham": "West Ham United",
  wolves: "Wolverhampton Wanderers",
  wolverhampton: "Wolverhampton Wanderers",
  wrexham: "Wrexham",
  arsenal: "Arsenal",
  "aston villa": "Aston Villa",
  "man city": "Manchester City",
  "manchester city": "Manchester City",
  "man utd": "Manchester United",
  "manchester utd": "Manchester United",
  "manchester united": "Manchester United",
  liverpool: "Liverpool",
  chelsea: "Chelsea",
  tottenham: "Tottenham Hotspur",
  spurs: "Tottenham Hotspur",
  "crystal palace": "Crystal Palace",
  everton: "Everton",
  fulham: "Fulham",
  brighton: "Brighton & Hove Albion",
  bournemouth: "AFC Bournemouth",
  "afc bournemouth": "AFC Bournemouth",
  brentford: "Brentford",
  newcastle: "Newcastle United",
  "nottingham forest": "Nottingham Forest",
  "nott'm forest": "Nottingham Forest",
  forest: "Nottingham Forest",
  sunderland: "Sunderland",
  leeds: "Leeds United",
  hull: "Hull City",
  ipswich: "Ipswich Town",
  coventry: "Coventry City",
};

function todayIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeName(name) {
  return String(name || "")
    .replace(/&amp;/g, "&")
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTeamIndex(teams) {
  const byName = new Map();
  for (const team of teams) {
    if (team.teamType !== "CURRENT_TEAM" || !team.league) continue;
    byName.set(team.name.toLowerCase(), team.id);
    byName.set(team.abbreviation.toLowerCase(), team.id);
    const short = team.name
      .replace(/\b(AFC|FC|United|City|Town|Athletic|Rovers|Wanderers|County|Argyle|Hotspur|Albion)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (short) byName.set(short, team.id);
  }
  for (const [alias, formal] of Object.entries(NAME_ALIASES)) {
    const id = byName.get(formal.toLowerCase());
    if (id) byName.set(alias, id);
  }
  return byName;
}

function resolveTeam(byName, raw) {
  const name = normalizeName(raw);
  const key = name.toLowerCase();
  if (byName.has(key)) return byName.get(key);
  const alias = NAME_ALIASES[key];
  if (alias && byName.has(alias.toLowerCase())) return byName.get(alias.toLowerCase());
  return null;
}

function parseFishyDate(label) {
  const m = String(label).match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return null;
  const months = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const mon = months[m[2]];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
}

/** Fixture headers look like "Tue 20/10" (season year inferred from month). */
function parseFishyFixtureDate(label, seasonStartYear = 2026) {
  const m = String(label).match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const mon = m[2].padStart(2, "0");
  const monthNum = Number(mon);
  const year = monthNum >= 7 ? seasonStartYear : seasonStartYear + 1;
  return `${year}-${mon}-${day}`;
}

function decodeScore(text) {
  return String(text)
    .replace(/&#8209;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/[‑–—]/g, "-");
}

function parseFishyHtml(html, competition, byName) {
  const matches = [];
  let currentDate = null;
  const dateRe = /<tr class='success'><th colspan='5'>([^<]+)<\/th><\/tr>/g;
  const rowRe =
    /<tr class='cats'><td>(\d{1,2}:\d{2})<\/td><td class='home'><a[^>]*>([^<]+)<\/a><\/td><td class='catsc'><a[^>]*>([^<]+)<\/a>/g;

  // Walk chronologically by splitting on date headers.
  const parts = html.split(/<tr class='success'><th colspan='5'>/);
  for (const part of parts) {
    const dateMatch = part.match(/^([^<]+)<\/th><\/tr>/);
    if (dateMatch) {
      currentDate = parseFishyDate(dateMatch[1]);
    }
    if (!currentDate) continue;
    let row;
    const localRowRe = new RegExp(rowRe.source, "g");
    while ((row = localRowRe.exec(part))) {
      const time = row[1].length === 4 ? `0${row[1]}` : row[1];
      const homeName = normalizeName(row[2]);
      const scoreBits = decodeScore(row[3]).match(/(\d+)\s*-\s*(\d+)/);
      if (!scoreBits) continue;
      // Away team sits after the score cell.
      const after = part.slice(row.index + row[0].length);
      const awayMatch = after.match(/^[\s\S]*?<td><a class='cats' href='[^']*'>([^<]+)<\/a><\/td>/);
      if (!awayMatch) continue;
      const awayName = normalizeName(awayMatch[1]);
      const homeTeamId = resolveTeam(byName, homeName);
      const awayTeamId = resolveTeam(byName, awayName);
      if (!homeTeamId || !awayTeamId) {
        console.warn(`  skip unmapped: ${homeName} vs ${awayName}`);
        continue;
      }
      matches.push({
        competition,
        date: currentDate,
        time,
        homeTeamId,
        awayTeamId,
        homeScore: Number(scoreBits[1]),
        awayScore: Number(scoreBits[2]),
        played: true,
      });
    }
  }
  void dateRe;
  return matches;
}

async function fetchResultPages(table) {
  const pages = [];
  // Paginate until a page has no result rows. The old hard cap (begin<=60) dropped
  // early Championship / League One cards once midweek results pushed them past page 5.
  for (let begin = 0; begin <= 300; begin += 15) {
    const url = `https://www.thefishy.net/football-results.php?table=${table}&season=24&begin=${begin}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "golaco-results-refresh/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const html = await res.text();
    const rowCount = (html.match(/<tr class='cats'>/g) || []).length;
    if (rowCount === 0) break;
    pages.push(html);
    // Keep going when Fishy omits the next-page link but still has further begins.
    if (!html.includes(`begin=${begin + 15}`) && rowCount < 15) break;
  }
  return pages.join("\n");
}

function parseFishyFixturesHtml(html, competition, byName) {
  const matches = [];
  // Date headers: <tr class='success'><th colspan='2'>Tue 20/10</th>...
  const parts = html.split(/<tr class='success'><th colspan='2'>/);
  for (const part of parts) {
    const dateMatch = part.match(/^([^<]+)<\/th>/);
    if (!dateMatch) continue;
    const currentDate = parseFishyFixtureDate(dateMatch[1]);
    if (!currentDate) continue;
    const rowRe =
      /<tr class='cats'><td>(\d{1,2}:\d{2})<\/td><td><a href='\/head2head\.php\?team1=([^&']+)&amp;team2=([^&']+)[^']*'>([^<]+)<\/a>/g;
    let row;
    while ((row = rowRe.exec(part))) {
      const time = row[1].length === 4 ? `0${row[1]}` : row[1];
      const homeRaw = decodeURIComponent(row[2].replace(/\+/g, " "));
      const awayRaw = decodeURIComponent(row[3].replace(/\+/g, " "));
      const homeTeamId = resolveTeam(byName, homeRaw);
      const awayTeamId = resolveTeam(byName, awayRaw);
      if (!homeTeamId || !awayTeamId) {
        console.warn(`  skip unmapped fixture: ${homeRaw} vs ${awayRaw}`);
        continue;
      }
      matches.push({
        competition,
        date: currentDate,
        time,
        homeTeamId,
        awayTeamId,
        played: false,
      });
    }
  }
  return matches;
}

async function fetchFixturePages(table) {
  const pages = [];
  // Fixtures paginate with `start=` (not `begin=`).
  for (let start = 0; start <= 600; start += 15) {
    const url = `https://www.thefishy.net/football-fixtures.php?table=${table}&season=24&start=${start}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "golaco-results-refresh/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const html = await res.text();
    const rowCount = (html.match(/<tr class='cats'>/g) || []).length;
    if (rowCount === 0) break;
    pages.push(html);
    if (!html.includes(`start=${start + 15}`) && rowCount < 15) break;
  }
  return pages.join("\n");
}

function upsertMatch(byKey, match) {
  const key = `${match.competition}|${match.homeTeamId}|${match.awayTeamId}`;
  const prev = byKey.get(key);
  if (!prev) {
    byKey.set(key, match);
    return;
  }
  // Played results always beat an unplayed listing for the same pairing.
  if (match.played && !prev.played) {
    byKey.set(key, match);
    return;
  }
  if (!match.played && prev.played) return;
  if (match.played && prev.played && match.date >= prev.date) {
    byKey.set(key, match);
    return;
  }
  if (!match.played && !prev.played && match.date >= prev.date) {
    byKey.set(key, match);
  }
}

function resolveTeamLoose(byName, raw) {
  const direct = resolveTeam(byName, raw);
  if (direct) return direct;
  const norm = normalizeClubName(raw);
  if (byName.has(norm)) return byName.get(norm);
  // football.json uses "Manchester United FC" etc.
  for (const [key, id] of byName) {
    if (normalizeClubName(key) === norm) return id;
  }
  return null;
}

async function fetchFootballJsonFallback(byName) {
  const out = [];
  for (const { path, competition } of FOOTBALL_JSON_FILES) {
    const url = FOOTBALL_JSON_BASE + path;
    process.stdout.write(`  openfootball ${path}… `);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "golaco-results-refresh/1.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = mapFootballJsonMatches(json, competition, (name) => resolveTeamLoose(byName, name));
      const played = rows.filter((m) => m.played).length;
      console.log(`${rows.length} (${played} played)`);
      out.push(...rows);
    } catch (err) {
      console.warn(`failed (${err instanceof Error ? err.message : err})`);
    }
  }
  return out;
}

async function main() {
  const teams = JSON.parse(readFileSync(teamsFile, "utf8"));
  const byName = buildTeamIndex(teams);
  // Also index normalized club names for football.json "… FC" labels.
  for (const team of teams) {
    if (team.teamType !== "CURRENT_TEAM" || !team.league) continue;
    byName.set(normalizeClubName(team.name), team.id);
  }
  const collected = [];
  let source = "thefishy";
  let fishyOk = false;
  try {
    for (const { table, competition } of COMPETITIONS) {
      process.stdout.write(`Fetching ${competition} results… `);
      const resultsHtml = await fetchResultPages(table);
      const results = parseFishyHtml(resultsHtml, competition, byName);
      console.log(`${results.length}`);
      collected.push(...results);

      process.stdout.write(`Fetching ${competition} fixtures… `);
      const fixturesHtml = await fetchFixturePages(table);
      const fixtures = parseFishyFixturesHtml(fixturesHtml, competition, byName);
      console.log(`${fixtures.length}`);
      collected.push(...fixtures);
    }
    fishyOk = collected.some((m) => m.played);
  } catch (err) {
    console.warn(`TheFishy refresh failed (${err instanceof Error ? err.message : err}).`);
  }

  // Always pull openfootball as backup / gap-fill (CC0). Fishy rows win on upsert for same pairing.
  console.log("Fetching openfootball/football.json fallback…");
  const fb = await fetchFootballJsonFallback(byName);
  if (fb.length) {
    collected.push(...fb);
    source = fishyOk ? "thefishy+openfootball" : "openfootball";
  } else if (!fishyOk) {
    source = "manual";
    console.warn("No Fishy or openfootball data — keeping existing overlay.");
    if (existsSync(outFile)) {
      const prev = JSON.parse(readFileSync(outFile, "utf8"));
      console.log(`Overlay asOf=${prev.asOf ?? "?"} matches=${(prev.matches ?? []).length}`);
      return;
    }
  }

  const season = collected.filter((m) => m.date >= "2026-08-01");
  const byKey = new Map();
  // Prefer TheFishy: seed openfootball first, then Fishy overwrites same pairings.
  const fbRefs = new Set(fb);
  for (const match of season.filter((m) => fbRefs.has(m))) upsertMatch(byKey, match);
  for (const match of season.filter((m) => !fbRefs.has(m))) upsertMatch(byKey, match);

  // Drop same-day double-bookings (Fishy sometimes lists rearranged + original cards).
  // Prefer played rows, then earlier kick-off.
  const byTeamDate = new Map();
  const sortedCandidates = [...byKey.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.played) - Number(a.played) ||
      String(a.time ?? "").localeCompare(String(b.time ?? "")),
  );
  const matches = [];
  for (const match of sortedCandidates) {
    const home = `${match.date}|${match.homeTeamId}|${match.competition}`;
    const away = `${match.date}|${match.awayTeamId}|${match.competition}`;
    if (byTeamDate.has(home) || byTeamDate.has(away)) continue;
    byTeamDate.set(home, match);
    byTeamDate.set(away, match);
    matches.push(match);
  }
  matches.sort(
    (a, b) => a.date.localeCompare(b.date) || String(a.time ?? "").localeCompare(String(b.time ?? "")),
  );
  const playedDates = matches.filter((m) => m.played).map((m) => m.date).sort();
  const asOf = playedDates.length ? playedDates[playedDates.length - 1] : todayIso();
  const byCompPlayed = {};
  const byCompUpcoming = {};
  for (const match of matches) {
    if (match.played) byCompPlayed[match.competition] = (byCompPlayed[match.competition] || 0) + 1;
    else byCompUpcoming[match.competition] = (byCompUpcoming[match.competition] || 0) + 1;
  }
  for (const { competition } of COMPETITIONS) {
    if (!(byCompPlayed[competition] > 0)) {
      throw new Error(`No ${competition} results parsed — refusing to overwrite overlay.`);
    }
  }
  const payload = {
    asOf,
    source,
    refreshedAt: new Date().toISOString(),
    matches,
  };
  writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(
    `Wrote ${matches.length} overlay matches → ${outFile} (asOf ${asOf}, source=${source})`,
    `played=${JSON.stringify(byCompPlayed)} upcoming=${JSON.stringify(byCompUpcoming)}`,
  );
  if (asOf < todayIso()) {
    console.warn(
      `Note: overlay asOf ${asOf} is behind today ${todayIso()}. Midweek cards may still be pending on TheFishy.`,
    );
  }
}

await main();
