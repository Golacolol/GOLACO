#!/usr/bin/env node
/**
 * Crests-only pack importer → public/assets/crests/{teamId}.png
 *
 * Sources (in order):
 *   1. Sibling crest already on disk (shared club key)
 *   2. football-data.org crest CDN (static IDs)
 *   3. luukhopman/football-logos on GitHub
 *   4. TheSportsDB badges (rate-limited, retries)
 *   5. --local /path/to/pack  (optional override)
 *
 * Usage:
 *   npm run assets:crests
 *   npm run assets:crests -- --force
 *   node scripts/import-crests.mjs --local /path/to/logos
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "assets", "crests");
const teamsPath = path.join(root, "public", "data", "teams.json");
const classicTeamsDir = path.join(root, "src", "data", "classicTeams");

const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/123";
const GH_LOGO = "https://raw.githubusercontent.com/luukhopman/football-logos/master/logos";
const FD_CREST = "https://crests.football-data.org";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const force = args.includes("--force");
const localIdx = args.indexOf("--local");
const localDir = localIdx >= 0 ? path.resolve(args[localIdx + 1] ?? "") : null;

/** Club key → football-data.org crest id */
const FD_BY_CLUB = {
  arsenal: 57,
  aston_villa: 58,
  blackburn: 59,
  bolton: 60,
  chelsea: 61,
  everton: 62,
  fulham: 63,
  liverpool: 64,
  manchester_city: 65,
  mancity: 65,
  manchester_united: 66,
  manutd: 66,
  newcastle: 67,
  newcastle_united: 67,
  norwich: 68,
  norwich_city: 68,
  qpr: 69,
  queens_park_rangers: 69,
  stoke: 70,
  stoke_city: 70,
  sunderland: 71,
  swansea: 72,
  swansea_city: 72,
  tottenham: 73,
  tottenham_hotspur: 73,
  west_brom: 74,
  west_bromwich_albion: 74,
  wolves: 76,
  wolverhampton_wanderers: 76,
  burnley: 328,
  birmingham: 332,
  birmingham_city: 332,
  blackpool: 336,
  leicester: 338,
  leicester_city: 338,
  southampton: 340,
  leeds: 341,
  leeds_united: 341,
  derby: 342,
  derby_county: 342,
  middlesbrough: 343,
  sheffield_wednesday: 345,
  watford: 346,
  charlton: 348,
  charlton_athletic: 348,
  ipswich: 349,
  ipswich_town: 349,
  nottingham_forest: 351,
  forest: 351,
  crystal_palace: 354,
  sheffield_united: 356,
  reading: 357,
  millwall: 384,
  bristol_city: 387,
  luton: 389,
  luton_town: 389,
  brighton: 397,
  brentford: 402,
  west_ham: 563,
  west_ham_united: 563,
  cardiff: 715,
  cardiff_city: 715,
  bournemouth: 1044,
  wrexham: 1075,
  coventry: 1076,
  coventry_city: 1076,
  plymouth: 1077,
  plymouth_argyle: 1077,
  preston: 1081,
  preston_north_end: 1081,
  hull: 322,
  hull_city: 322,
  portsmouth: 325,
  barnsley: 3567,
  // Europe / classics
  barcelona: 81,
  realmadrid: 86,
  real_madrid: 86,
  bayern: 5,
  dortmund: 4,
  milan: 98,
  inter: 108,
  juventus: 109,
  lazio: 110,
  napoli: 113,
  roma: 100,
  valencia: 95,
  psg: 524,
  monaco: 516,
  porto: 503,
  ajax: 678,
  celtic: 674,
  rangers: 675,
};

/** National teams: football-data SVG area codes (rasterized via magick when present). */
const FD_NATION_SVG = {
  england: 770,
  spain: 760,
  france: 773,
  brazil: 764,
  argentina: 762,
};

/** Club key → [league folder, filename] in luukhopman/football-logos */
const GH_BY_CLUB = {
  arsenal: ["England - Premier League", "Arsenal FC.png"],
  aston_villa: ["England - Premier League", "Aston Villa.png"],
  bournemouth: ["England - Premier League", "AFC Bournemouth.png"],
  brentford: ["England - Premier League", "Brentford FC.png"],
  brighton: ["England - Premier League", "Brighton & Hove Albion.png"],
  chelsea: ["England - Premier League", "Chelsea FC.png"],
  coventry: ["England - Premier League", "Coventry City.png"],
  coventry_city: ["England - Premier League", "Coventry City.png"],
  crystal_palace: ["England - Premier League", "Crystal Palace.png"],
  everton: ["England - Premier League", "Everton FC.png"],
  fulham: ["England - Premier League", "Fulham FC.png"],
  hull: ["England - Premier League", "Hull City.png"],
  hull_city: ["England - Premier League", "Hull City.png"],
  ipswich: ["England - Premier League", "Ipswich Town.png"],
  ipswich_town: ["England - Premier League", "Ipswich Town.png"],
  leeds: ["England - Premier League", "Leeds United.png"],
  leeds_united: ["England - Premier League", "Leeds United.png"],
  liverpool: ["England - Premier League", "Liverpool FC.png"],
  manchester_city: ["England - Premier League", "Manchester City.png"],
  mancity: ["England - Premier League", "Manchester City.png"],
  manchester_united: ["England - Premier League", "Manchester United.png"],
  manutd: ["England - Premier League", "Manchester United.png"],
  newcastle: ["England - Premier League", "Newcastle United.png"],
  newcastle_united: ["England - Premier League", "Newcastle United.png"],
  nottingham_forest: ["England - Premier League", "Nottingham Forest.png"],
  forest: ["England - Premier League", "Nottingham Forest.png"],
  sunderland: ["England - Premier League", "Sunderland AFC.png"],
  tottenham: ["England - Premier League", "Tottenham Hotspur.png"],
  tottenham_hotspur: ["England - Premier League", "Tottenham Hotspur.png"],
  barcelona: ["Spain - LaLiga", "FC Barcelona.png"],
  realmadrid: ["Spain - LaLiga", "Real Madrid.png"],
  atletico: ["Spain - LaLiga", "Atlético de Madrid.png"],
  valencia: ["Spain - LaLiga", "Valencia CF.png"],
  deportivo: ["Spain - LaLiga", "Deportivo A Coruña.png"],
  milan: ["Italy - Serie A", "AC Milan.png"],
  inter: ["Italy - Serie A", "Inter Milan.png"],
  juventus: ["Italy - Serie A", "Juventus FC.png"],
  lazio: ["Italy - Serie A", "SS Lazio.png"],
  napoli: ["Italy - Serie A", "SSC Napoli.png"],
  roma: ["Italy - Serie A", "AS Roma.png"],
  parma: ["Italy - Serie A", "Parma Calcio 1913.png"],
  fiorentina: ["Italy - Serie A", "ACF Fiorentina.png"],
  torino: ["Italy - Serie A", "Torino FC.png"],
  sampdoria: ["Italy - Serie A", "UC Sampdoria.png"], // may 404 if not in current season
  bayern: ["Germany - Bundesliga", "Bayern Munich.png"],
  dortmund: ["Germany - Bundesliga", "Borussia Dortmund.png"],
  psg: ["France - Ligue 1", "Paris Saint-Germain.png"],
  monaco: ["France - Ligue 1", "AS Monaco.png"],
  marseille: ["France - Ligue 1", "Olympique Marseille.png"],
  ajax: ["Netherlands - Eredivisie", "Ajax Amsterdam.png"],
  psv: ["Netherlands - Eredivisie", "PSV Eindhoven.png"],
  porto: ["Portugal - Liga Portugal", "FC Porto.png"],
  celtic: ["Scotland - Scottish Premiership", "Celtic FC.png"],
  rangers: ["Scotland - Scottish Premiership", "Rangers FC.png"],
  redstar: ["Serbia - Super liga Srbije", "Red Star Belgrade.png"],
  steaua: ["Romania - SuperLiga", "FCSB.png"],
  galatasaray: ["Türkiye - Süper Lig", "Galatasaray.png"],
  dynamo_kyiv: ["Ukraine - Premier Liga", "Dynamo Kyiv.png"],
};

/** Club key → TheSportsDB search (fallback). */
const SEARCH_BY_CLUB = {
  plymouth_argyle: "Plymouth Argyle",
  plymouth: "Plymouth Argyle",
  barnsley: "Barnsley",
  arsenal: "Arsenal",
  aston_villa: "Aston Villa",
  astonvilla: "Aston Villa",
  bournemouth: "AFC Bournemouth",
  brentford: "Brentford",
  brighton: "Brighton",
  chelsea: "Chelsea",
  coventry: "Coventry City",
  coventry_city: "Coventry City",
  crystal_palace: "Crystal Palace",
  everton: "Everton",
  fulham: "Fulham",
  hull_city: "Hull City",
  hull: "Hull City",
  ipswich_town: "Ipswich Town",
  ipswich: "Ipswich Town",
  leeds_united: "Leeds United",
  leeds: "Leeds United",
  liverpool: "Liverpool",
  manchester_city: "Manchester City",
  mancity: "Manchester City",
  manchester_united: "Manchester United",
  manutd: "Manchester United",
  newcastle_united: "Newcastle United",
  newcastle: "Newcastle United",
  nottingham_forest: "Nottingham Forest",
  forest: "Nottingham Forest",
  sunderland: "Sunderland",
  tottenham_hotspur: "Tottenham",
  tottenham: "Tottenham",
  birmingham_city: "Birmingham City",
  birmingham: "Birmingham City",
  blackburn_rovers: "Blackburn Rovers",
  blackburn: "Blackburn Rovers",
  bolton_wanderers: "Bolton Wanderers",
  bolton: "Bolton Wanderers",
  bristol_city: "Bristol City",
  burnley: "Burnley",
  cardiff_city: "Cardiff City",
  cardiff: "Cardiff City",
  charlton_athletic: "Charlton Athletic",
  charlton: "Charlton Athletic",
  derby_county: "Derby County",
  derby: "Derby County",
  lincoln_city: "Lincoln City",
  lincoln: "Lincoln City",
  middlesbrough: "Middlesbrough",
  millwall: "Millwall",
  norwich_city: "Norwich City",
  norwich: "Norwich City",
  portsmouth: "Portsmouth",
  preston_north_end: "Preston North End",
  preston: "Preston North End",
  queens_park_rangers: "Queens Park Rangers",
  qpr: "Queens Park Rangers",
  sheffield_united: "Sheffield United",
  stoke_city: "Stoke City",
  stoke: "Stoke City",
  swansea_city: "Swansea City",
  swansea: "Swansea City",
  watford: "Watford",
  west_bromwich_albion: "West Brom",
  west_brom: "West Brom",
  west_ham_united: "West Ham",
  west_ham: "West Ham",
  wolverhampton_wanderers: "Wolverhampton Wanderers",
  wolves: "Wolverhampton Wanderers",
  wrexham: "Wrexham",
  southampton: "Southampton",
  afc_wimbledon: "AFC Wimbledon",
  blackpool: "Blackpool",
  bradford_city: "Bradford City",
  bromley: "Bromley",
  burton_albion: "Burton Albion",
  cambridge_united: "Cambridge United",
  doncaster_rovers: "Doncaster Rovers",
  huddersfield_town: "Huddersfield Town",
  leicester_city: "Leicester City",
  leicester: "Leicester City",
  leyton_orient: "Leyton Orient",
  luton_town: "Luton Town",
  luton: "Luton Town",
  mansfield_town: "Mansfield Town",
  mk_dons: "Milton Keynes Dons",
  notts_county: "Notts County",
  oxford_united: "Oxford United",
  peterborough_united: "Peterborough United",
  reading: "Reading",
  sheffield_wednesday: "Sheffield Wednesday",
  stevenage: "Stevenage",
  stockport_county: "Stockport County",
  wigan_athletic: "Wigan Athletic",
  wycombe_wanderers: "Wycombe Wanderers",
  barcelona: "Barcelona",
  realmadrid: "Real Madrid",
  bayern: "Bayern Munich",
  dortmund: "Borussia Dortmund",
  milan: "AC Milan",
  inter: "Inter",
  juventus: "Juventus",
  lazio: "Lazio",
  napoli: "Napoli",
  roma: "Roma",
  parma: "Parma",
  fiorentina: "Fiorentina",
  torino: "Torino",
  sampdoria: "Sampdoria",
  psg: "Paris SG",
  monaco: "Monaco",
  marseille: "Marseille",
  ajax: "Ajax",
  psv: "PSV",
  porto: "Porto",
  celtic: "Celtic",
  rangers: "Rangers",
  atletico: "Atletico Madrid",
  valencia: "Valencia",
  deportivo: "Deportivo La Coruna",
  redstar: "Red Star Belgrade",
  steaua: "Steaua Bucharest",
  galatasaray: "Galatasaray",
  dynamo_kyiv: "Dynamo Kyiv",
  england: "England",
  france: "France",
  spain: "Spain",
  brazil: "Brazil",
  argentina: "Argentina",
};

function clubKeyFromTeamId(teamId) {
  let id = teamId.replace(/^classic_/, "").replace(/_current$/, "");
  // Season suffixes: _2014_15, _1995_96, or single-year internationals _1986 / _2002
  id = id.replace(/_\d{4}_\d{2}$/, "").replace(/_\d{4}$/, "");
  // aliases
  if (id === "argyle_fans_xi" || id === "argyle_historic_sample") return "plymouth_argyle";
  if (id === "astonvilla") return "aston_villa";
  if (id === "forest") return "nottingham_forest";
  return id;
}

function collectClassicTeamIds() {
  const ids = new Set();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".ts")) {
        const text = fs.readFileSync(p, "utf8");
        for (const m of text.matchAll(/teamId:\s*"([^"]+)"/g)) ids.add(m[1]);
        for (const m of text.matchAll(/id:\s*"([a-z0-9_]+_\d{4}_\d{2})"/g)) ids.add(`classic_${m[1]}`);
      }
    }
  };
  walk(classicTeamsDir);
  return [...ids];
}

function buildTargets() {
  const teams = JSON.parse(fs.readFileSync(teamsPath, "utf8"));
  const targets = [];
  const seen = new Set();
  for (const t of teams) {
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    targets.push(t.id);
  }
  for (const id of collectClassicTeamIds()) {
    if (seen.has(id)) continue;
    seen.add(id);
    targets.push(id);
  }
  for (const id of [...targets]) {
    const short = id.replace(/_current$/, "").replace(/_20\d{2}_\d{2}$/, "");
    if (short !== id && !seen.has(short)) {
      seen.add(short);
      targets.push(short);
    }
  }
  return targets;
}

function groupByClub(teamIds) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const id of teamIds) {
    const key = clubKeyFromTeamId(id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  return groups;
}

async function fetchBytes(url, { acceptMissing = false } = {}) {
  const res = await fetch(url, { headers: { "User-Agent": "FPC-crest-import/1.0" } });
  if (res.status === 404 && acceptMissing) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error(`tiny ${url}`);
  return buf;
}

async function fromFootballData(club) {
  const id = FD_BY_CLUB[club];
  if (id) {
    try {
      return await fetchBytes(`${FD_CREST}/${id}.png`);
    } catch {
      /* fall through */
    }
  }
  const nation = FD_NATION_SVG[club];
  if (!nation) return null;
  // Prefer PNG when hosted; otherwise SVG → PNG via ImageMagick.
  try {
    return await fetchBytes(`${FD_CREST}/${nation}.png`);
  } catch {
    /* try svg */
  }
  const svg = await fetchBytes(`${FD_CREST}/${nation}.svg`);
  const tmpSvg = path.join(outDir, `._tmp_${club}.svg`);
  const tmpPng = path.join(outDir, `._tmp_${club}.png`);
  fs.writeFileSync(tmpSvg, svg);
  const magick = spawnSync(
    "magick",
    ["-background", "none", tmpSvg, "-resize", "256x256", `png32:${tmpPng}`],
    { encoding: "utf8" },
  );
  try {
    fs.unlinkSync(tmpSvg);
  } catch {
    /* ignore */
  }
  if (magick.status !== 0 || !fs.existsSync(tmpPng) || fs.statSync(tmpPng).size < 2000) {
    try {
      fs.unlinkSync(tmpPng);
    } catch {
      /* ignore */
    }
    return null;
  }
  const bytes = fs.readFileSync(tmpPng);
  try {
    fs.unlinkSync(tmpPng);
  } catch {
    /* ignore */
  }
  return bytes;
}

async function fromGitHub(club) {
  const entry = GH_BY_CLUB[club];
  if (!entry) return null;
  const [league, file] = entry;
  const url = `${GH_LOGO}/${encodeURIComponent(league).replace(/%20/g, "%20")}/${encodeURIComponent(file)}`;
  // encodeURIComponent encodes spaces as %20 which is correct for raw.githubusercontent
  try {
    return await fetchBytes(url, { acceptMissing: true });
  } catch {
    return null;
  }
}

function pickSportsDbTeam(results, query) {
  if (!results?.length) return null;
  const q = query.toLowerCase();
  const soccer = results.filter((t) => /soccer|football/i.test(t.strSport || "") || !t.strSport);
  const pool = soccer.length ? soccer : results;
  return (
    pool.find((t) => (t.strTeam || "").toLowerCase() === q) ||
    pool.find((t) => (t.strTeam || "").toLowerCase().startsWith(q)) ||
    pool[0]
  );
}

async function fromSportsDb(club, cache) {
  const query = SEARCH_BY_CLUB[club] || club.replace(/_/g, " ");
  if (cache.has(query)) return cache.get(query);
  let attempt = 0;
  while (attempt < 6) {
    attempt++;
    const res = await fetch(`${SPORTSDB}/searchteams.php?t=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "FPC-crest-import/1.0" },
    });
    if (res.status === 429) {
      const wait = 4000 * attempt;
      console.warn(`    rate-limit SportsDB, wait ${wait}ms`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`SportsDB ${res.status}`);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      await sleep(3000 * attempt);
      continue;
    }
    const team = pickSportsDbTeam(json.teams, query);
    const badge = team?.strBadge || team?.strTeamBadge || null;
    let bytes = null;
    if (badge) {
      bytes = await fetchBytes(badge);
      await sleep(200);
    }
    cache.set(query, bytes);
    await sleep(1600);
    return bytes;
  }
  cache.set(query, null);
  return null;
}

function listLocalFiles(dir) {
  const map = new Map();
  if (!dir || !fs.existsSync(dir)) return map;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(png|webp|jpg|jpeg|svg)$/i.test(name)) continue;
    map.set(name.replace(/\.[^.]+$/, "").toLowerCase(), path.join(dir, name));
  }
  return map;
}

function fromLocal(club, teamIds, localFiles) {
  if (!localFiles?.size) return null;
  const candidates = [club, ...teamIds, (SEARCH_BY_CLUB[club] || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")];
  for (const c of candidates) {
    if (!c) continue;
    if (localFiles.has(c)) return fs.readFileSync(localFiles.get(c));
  }
  return null;
}

function writeAll(teamIds, bytes) {
  for (const id of teamIds) {
    fs.writeFileSync(path.join(outDir, `${id}.png`), bytes);
  }
}

function allPresent(teamIds) {
  return teamIds.every((id) => {
    const p = path.join(outDir, `${id}.png`);
    return fs.existsSync(p) && fs.statSync(p).size > 200;
  });
}

function findSiblingBytes(teamIds) {
  for (const id of teamIds) {
    const p = path.join(outDir, `${id}.png`);
    if (fs.existsSync(p) && fs.statSync(p).size > 200) return fs.readFileSync(p);
  }
  return null;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const targets = buildTargets();
  const groups = groupByClub(targets);
  const localFiles = localDir ? listLocalFiles(localDir) : null;
  const sportsCache = new Map();
  let ok = 0;
  let skip = 0;
  let fail = 0;

  console.log(`Crests-only → ${outDir}`);
  console.log(`Teams ${targets.length} across ${groups.size} clubs${localDir ? ` (local ${localDir})` : ""}`);

  for (const [club, teamIds] of groups) {
    if (!force && allPresent(teamIds)) {
      skip += teamIds.length;
      continue;
    }

    let bytes = null;
    let source = "";

    try {
      if (!force) {
        bytes = findSiblingBytes(teamIds);
        if (bytes) source = "sibling";
      }
      if (!bytes && localFiles) {
        bytes = fromLocal(club, teamIds, localFiles);
        if (bytes) source = "local";
      }
      if (!bytes) {
        bytes = await fromFootballData(club);
        if (bytes) source = "football-data";
      }
      if (!bytes) {
        bytes = await fromGitHub(club);
        if (bytes) source = "github-logos";
      }
      if (!bytes) {
        bytes = await fromSportsDb(club, sportsCache);
        if (bytes) source = "sportsdb";
      }

      if (!bytes) {
        console.warn(`  miss  ${club}  (${teamIds.length} ids)`);
        fail += teamIds.length;
        continue;
      }

      writeAll(teamIds, bytes);
      console.log(`  ok    ${club.padEnd(28)} ← ${source}  ×${teamIds.length}`);
      ok += teamIds.length;
    } catch (err) {
      console.warn(`  fail  ${club}  ${err.message}`);
      fail += teamIds.length;
    }
  }

  console.log(`Done. wrote=${ok} skipped=${skip} failed=${fail}`);
  if (fail && ok === 0 && skip === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
