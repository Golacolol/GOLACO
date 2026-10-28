#!/usr/bin/env node
/**
 * Refresh current (non-classic) club squads from Wikipedia 2026–27 season pages.
 * Rewrites squad strings in scripts/english-clubs.mjs, then you run:
 *   npm run data:leagues
 *
 * Skips plymouth_argyle_current (hand-authored sacred XI).
 *
 * Usage:
 *   node scripts/refresh-current-squads.mjs
 *   node scripts/refresh-current-squads.mjs --only bristol_city_current,huddersfield_town_current
 *   node scripts/refresh-current-squads.mjs --dry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLUBS } from "./english-clubs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clubsPath = path.join(root, "scripts", "english-clubs.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0
  ? new Set((args[onlyIdx + 1] || "").split(",").map((s) => s.trim()).filter(Boolean))
  : null;

const SKIP = new Set(["plymouth_argyle_current"]);

/** Club article fallback when season pages lack appearance tables. */
const WIKI_CLUB = {
  arsenal_current: "Arsenal_F.C.",
  brentford_current: "Brentford_F.C.",
  chelsea_current: "Chelsea_F.C.",
  coventry_city_current: "Coventry_City_F.C.",
  ipswich_town_current: "Ipswich_Town_F.C.",
  leeds_united_current: "Leeds_United_F.C.",
  manchester_city_current: "Manchester_City_F.C.",
  manchester_united_current: "Manchester_United_F.C.",
  nottingham_forest_current: "Nottingham_Forest_F.C.",
  tottenham_hotspur_current: "Tottenham_Hotspur_F.C.",
  birmingham_city_current: "Birmingham_City_F.C.",
  burnley_current: "Burnley_F.C.",
  charlton_athletic_current: "Charlton_Athletic_F.C.",
  norwich_city_current: "Norwich_City_F.C.",
  stoke_city_current: "Stoke_City_F.C.",
};

/** Wikipedia season page title fragments (after 2026–27_ …). */
const WIKI_PAGE = {
  arsenal_current: "Arsenal_F.C._season",
  aston_villa_current: "Aston_Villa_F.C._season",
  bournemouth_current: "AFC_Bournemouth_season",
  brentford_current: "Brentford_F.C._season",
  brighton_current: "Brighton_&_Hove_Albion_F.C._season",
  chelsea_current: "Chelsea_F.C._season",
  coventry_city_current: "Coventry_City_F.C._season",
  crystal_palace_current: "Crystal_Palace_F.C._season",
  everton_current: "Everton_F.C._season",
  fulham_current: "Fulham_F.C._season",
  hull_city_current: "Hull_City_A.F.C._season",
  ipswich_town_current: "Ipswich_Town_F.C._season",
  leeds_united_current: "Leeds_United_F.C._season",
  liverpool_current: "Liverpool_F.C._season",
  manchester_city_current: "Manchester_City_F.C._season",
  manchester_united_current: "Manchester_United_F.C._season",
  newcastle_united_current: "Newcastle_United_F.C._season",
  nottingham_forest_current: "Nottingham_Forest_F.C._season",
  sunderland_current: "Sunderland_A.F.C._season",
  tottenham_hotspur_current: "Tottenham_Hotspur_F.C._season",
  birmingham_city_current: "Birmingham_City_F.C._season",
  blackburn_rovers_current: "Blackburn_Rovers_F.C._season",
  bolton_wanderers_current: "Bolton_Wanderers_F.C._season",
  bristol_city_current: "Bristol_City_F.C._season",
  burnley_current: "Burnley_F.C._season",
  cardiff_city_current: "Cardiff_City_F.C._season",
  charlton_athletic_current: "Charlton_Athletic_F.C._season",
  derby_county_current: "Derby_County_F.C._season",
  lincoln_city_current: "Lincoln_City_F.C._season",
  middlesbrough_current: "Middlesbrough_F.C._season",
  millwall_current: "Millwall_F.C._season",
  norwich_city_current: "Norwich_City_F.C._season",
  portsmouth_current: "Portsmouth_F.C._season",
  preston_north_end_current: "Preston_North_End_F.C._season",
  queens_park_rangers_current: "Queens_Park_Rangers_F.C._season",
  sheffield_united_current: "Sheffield_United_F.C._season",
  stoke_city_current: "Stoke_City_F.C._season",
  swansea_city_current: "Swansea_City_A.F.C._season",
  watford_current: "Watford_F.C._season",
  west_bromwich_albion_current: "West_Bromwich_Albion_F.C._season",
  west_ham_united_current: "West_Ham_United_F.C._season",
  wolverhampton_wanderers_current: "Wolverhampton_Wanderers_F.C._season",
  wrexham_current: "Wrexham_A.F.C._season",
  southampton_current: "Southampton_F.C._season",
  barnsley_current: "Barnsley_F.C._season",
  afc_wimbledon_current: "AFC_Wimbledon_season",
  blackpool_current: "Blackpool_F.C._season",
  bradford_city_current: "Bradford_City_A.F.C._season",
  bromley_current: "Bromley_F.C._season",
  burton_albion_current: "Burton_Albion_F.C._season",
  cambridge_united_current: "Cambridge_United_F.C._season",
  doncaster_rovers_current: "Doncaster_Rovers_F.C._season",
  huddersfield_town_current: "Huddersfield_Town_A.F.C._season",
  leicester_city_current: "Leicester_City_F.C._season",
  leyton_orient_current: "Leyton_Orient_F.C._season",
  luton_town_current: "Luton_Town_F.C._season",
  mansfield_town_current: "Mansfield_Town_F.C._season",
  mk_dons_current: "Milton_Keynes_Dons_F.C._season",
  notts_county_current: "Notts_County_F.C._season",
  oxford_united_current: "Oxford_United_F.C._season",
  peterborough_united_current: "Peterborough_United_F.C._season",
  reading_current: "Reading_F.C._season",
  sheffield_wednesday_current: "Sheffield_Wednesday_F.C._season",
  stevenage_current: "Stevenage_F.C._season",
  stockport_county_current: "Stockport_County_F.C._season",
  wigan_athletic_current: "Wigan_Athletic_F.C._season",
  wycombe_wanderers_current: "Wycombe_Wanderers_F.C._season",
};

/** Manual overrides when Wikipedia is thin / wrong (authoritative club lists). */
const MANUAL = {
  bristol_city_current: {
    formation: "4-2-3-1",
    squad:
      "1 GK Sam Tickle;2 RB Lisav Eissat;16 CB Rob Dickie;5 CB Rob Atkinson;3 LB Cameron Pring;4* DM Adam Randell;12 DM Jason Knight;17 RW Jed Wallace;10 AM Scott Twine;7 LW Yu Hirakawa;9 ST Lorent Tolaj;40 GK Brad Collins;19 RB George Tanner;15 CB Luke McNally;38 CB Noah Eile;6 CM Max Bird;8 CM Joe Williams;14 AM Tomi Horvat;11 ST Sam Bell;18 ST Emil Riis;20 ST Sam Greenwood;27 CM Gibson Yah",
  },
  huddersfield_town_current: {
    formation: "4-2-3-1",
    squad:
      "1 GK Matty Young;22 RB Ilias Bronkhorst;12 CB Radinio Balker;15 CB Ibane Bowat;19 LB Bali Mumba;4* DM Ryan Ledson;8 DM Archie Collins;30 RW Derensili Sanches Fernandes;10 AM Marcus Harness;11 LW Ashley Fletcher;9 ST Joe Taylor;31 GK Jak Alnwick;2 RB Lasse Sorensen;3 CB Murray Wallace;5 CB Joe Low;6 CB Jack Whatmough;23 LB Sean Roughan;16 CM Herbie Kane;20 CM Cameron Humphreys;18 CM David Kasumu;25 ST Bojan Radulovic;7 RB Lynden Gooch",
  },
};

function cleanName(raw) {
  let s = raw
    .replace(/'''''|''''|'''|''/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Drop parenthetical disambiguators left in display names
  s = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  return s;
}

function parseApps(token) {
  // "9+0" or " 0+3" → starts
  const m = String(token || "").trim().match(/^(\d+)\+(\d+)/);
  if (!m) return 0;
  return Number(m[1]) + Number(m[2]) * 0.35;
}

function parseNamedParams(body) {
  /** @type {Record<string, string>} */
  const params = {};
  for (const part of body.split("|")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const val = part.slice(eq + 1).trim();
    if (key) params[key] = val;
  }
  return params;
}

function parseEfsPlayers(wikitext) {
  const out = [];
  const re = /\{\{\s*Efs player\s*\|([^}]+)\}\}/gi;
  let m;
  while ((m = re.exec(wikitext))) {
    const params = parseNamedParams(m[1]);
    const no = Number(params.no);
    const band = (params.pos || "").toUpperCase();
    const name = cleanName(params.name || "");
    // First positional stats token after named params — often starts the apps block
    const apps = parseApps(params.lg || params.apps || "") ||
      Number((m[1].match(/\|\s*(\d+(?:\+\d+)?)\s*\|/) || [])[1]?.split("+")[0] || 0);
    // Prefer league apps from trailing |10|0| pattern after name
    const trail = m[1].match(/name\s*=\s*[^|]+\|([^}]+)$/i);
    let apps2 = apps;
    if (trail) {
      const first = trail[1].split("|").map((s) => s.trim()).find((s) => /^\d/.test(s));
      if (first) apps2 = parseApps(first) || Number(first) || apps;
    }
    if (!name || !no || !band) continue;
    out.push({ no, band, name, apps: apps2 });
  }
  return out;
}

/** {{Extended football squad player |no=1 |pos=GK |nat=... |name=... |7|0|...}} */
function parseExtendedSquadPlayers(wikitext) {
  const out = [];
  const re =
    /\{\{\s*Extended football squad player\s*\|\s*no\s*=\s*(\d+)\s*\|\s*pos\s*=\s*([A-Z]{2})\s*\|\s*nat\s*=\s*[A-Z]{3}\s*\|\s*name\s*=\s*([^|]+)\|([^|}]*)/gi;
  let m;
  while ((m = re.exec(wikitext))) {
    const no = Number(m[1]);
    const band = m[2].toUpperCase();
    const name = cleanName(m[3]);
    // apps may be plain "7" rather than "7+0"
    const appsTok = String(m[4] || "").trim();
    const apps = parseApps(appsTok) || Number(appsTok.match(/^\d+/)?.[0] || 0);
    if (!name || !no) continue;
    out.push({ no, band, name, apps });
  }
  return out;
}

/** {{Fb si player |p={{sortname|First|Last}} |n=1 |pos=GK |...}} — usually one line. */
function parseFbSiPlayers(wikitext) {
  const out = [];
  for (const line of wikitext.split("\n")) {
    if (!/\{\{\s*Fb si player/i.test(line)) continue;
    const sort = line.match(/\{\{\s*sortname\s*\|\s*([^}|]+)\s*\|\s*([^}|]+)\s*\}\}/i);
    const n = line.match(/\|\s*n\s*=\s*(\d+)/i);
    const pos = line.match(/\|\s*pos\s*=\s*([A-Z]{2})/i);
    const apps = line.match(/\|\s*a\s*=\s*(\d+)/i);
    const name = cleanName(sort ? `${sort[1]} ${sort[2]}` : "");
    if (!name || !n || !pos) continue;
    out.push({ no: Number(n[1]), band: pos[1].toUpperCase(), name, apps: Number(apps?.[1] || 0) });
  }
  return out;
}

/** {{Fs player|...}} / {{football squad player|...}} on club articles. */
function parseFsPlayers(wikitext) {
  const out = [];
  const re = /\{\{\s*(?:Fs player|football squad player)\s*\|([^}]+)\}\}/gi;
  let m;
  while ((m = re.exec(wikitext))) {
    const params = parseNamedParams(m[1]);
    const no = Number(params.no);
    const band = (params.pos || "").toUpperCase();
    const name = cleanName(params.name || "");
    if (!name || !no || !band) continue;
    // No apps on club page — prefer lower numbers slightly for XI seeding
    out.push({ no, band, name, apps: Math.max(0, 40 - no) });
  }
  return out;
}

function parseWikiPlayers(wikitext) {
  const parsers = [parseEfsPlayers, parseExtendedSquadPlayers, parseFbSiPlayers, parseFsPlayers];
  let best = [];
  for (const fn of parsers) {
    const got = fn(wikitext);
    if (got.length > best.length) best = got;
    if (got.length >= 11 && fn !== parseFsPlayers) return got;
  }
  // Prefer appearance-based tables; Fs club-page list is last resort.
  if (best.length >= 11) return best;
  const fs = parseFsPlayers(wikitext);
  return fs.length >= best.length ? fs : best;
}

async function fetchWikiTitle(title) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&page=" +
    encodeURIComponent(title);
  let lastErr = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "FPC-squad-refresh/1.0 (local game data; contact: local)" },
      });
      if (res.status === 429) {
        lastErr = new Error("HTTP 429");
        await sleep(8000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.info || json.error.code);
      return json.parse.wikitext["*"];
    } catch (err) {
      lastErr = err;
      await sleep(2500 * attempt);
    }
  }
  throw lastErr || new Error("fetch failed");
}

async function fetchWiki(pageSuffix, clubId) {
  // Prefer 2026–27; fall back to 2025–26; then club article current squad.
  const titles = [`2026–27_${pageSuffix}`, `2025–26_${pageSuffix}`];
  if (WIKI_CLUB[clubId]) titles.push(WIKI_CLUB[clubId]);
  let lastErr = null;
  for (const title of titles) {
    try {
      const wt = await fetchWikiTitle(title);
      const players = parseWikiPlayers(wt);
      if (players.length >= 11) return { wt, title, players };
      lastErr = new Error(`only ${players.length} wiki players on ${title}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(800);
  }
  throw lastErr || new Error("fetch failed");
}

function detailedPos(band, roleHint) {
  if (band === "GK") return "GK";
  if (band === "FW") return "ST";
  if (band === "DF") {
    if (roleHint === "RB") return "RB";
    if (roleHint === "LB") return "LB";
    return "CB";
  }
  if (band === "MF") {
    if (roleHint === "DM") return "DM";
    if (roleHint === "AM") return "AM";
    if (roleHint === "RW") return "RW";
    if (roleHint === "LW") return "LW";
    if (roleHint === "RM") return "RM";
    if (roleHint === "LM") return "LM";
    return "CM";
  }
  return "CM";
}

function buildSquadString(players, formation) {
  const gks = players.filter((p) => p.band === "GK").sort((a, b) => b.apps - a.apps || a.no - b.no);
  const dfs = players.filter((p) => p.band === "DF").sort((a, b) => b.apps - a.apps || a.no - b.no);
  const mfs = players.filter((p) => p.band === "MF").sort((a, b) => b.apps - a.apps || a.no - b.no);
  const fws = players.filter((p) => p.band === "FW").sort((a, b) => b.apps - a.apps || a.no - b.no);

  /** @type {{no:number,pos:string,name:string,captain?:boolean}[]} */
  const xi = [];
  const used = new Set();
  const take = (list, n) => {
    const got = [];
    for (const p of list) {
      if (used.has(p.no)) continue;
      got.push(p);
      used.add(p.no);
      if (got.length >= n) break;
    }
    return got;
  };

  const gk = take(gks, 1)[0];
  if (!gk) throw new Error("no GK");
  xi.push({ no: gk.no, pos: "GK", name: gk.name });

  const back = take(dfs, 4);
  while (back.length < 4) {
    const filler = take(mfs, 1)[0];
    if (!filler) break;
    back.push({ ...filler, band: "DF" });
  }
  // Sort back four by shirt for RB/CB/CB/LB heuristic
  back.sort((a, b) => a.no - b.no);
  const rb = back[0];
  const rcb = back[1] || back[0];
  const lcb = back[2] || back[1] || back[0];
  const lb = back[3] || back[2] || back[0];
  xi.push({ no: rb.no, pos: "RB", name: rb.name });
  xi.push({ no: rcb.no, pos: "CB", name: rcb.name });
  xi.push({ no: lcb.no, pos: "CB", name: lcb.name });
  xi.push({ no: lb.no, pos: "LB", name: lb.name });

  if (formation === "4-4-2") {
    const mids = take(mfs, 4);
    while (mids.length < 4) {
      const f = take(fws, 1)[0];
      if (!f) break;
      mids.push(f);
    }
    const roles = ["RM", "CM", "CM", "LM"];
    mids.forEach((p, i) => xi.push({ no: p.no, pos: roles[i], name: p.name }));
    const strikers = take(fws, 2);
    while (strikers.length < 2) {
      const f = take(mfs, 1)[0];
      if (!f) break;
      strikers.push(f);
    }
    strikers.forEach((p) => xi.push({ no: p.no, pos: "ST", name: p.name }));
  } else if (formation === "4-3-3") {
    const mids = take(mfs, 3);
    mids.forEach((p, i) => xi.push({ no: p.no, pos: i === 1 ? "CM" : "CM", name: p.name }));
    const wings = take([...mfs, ...fws].filter((p) => !used.has(p.no)).sort((a, b) => b.apps - a.apps), 2);
    const st = take(fws, 1)[0] || take(mfs, 1)[0];
    xi.push({ no: wings[0]?.no ?? 7, pos: "RW", name: wings[0]?.name ?? "Unknown" });
    if (st) xi.push({ no: st.no, pos: "ST", name: st.name });
    xi.push({ no: wings[1]?.no ?? 11, pos: "LW", name: wings[1]?.name ?? "Unknown" });
  } else if (formation === "3-4-2-1") {
    // Rebuild: drop RB/LB style — keep 3 CBs already partially wrong; rebuild simply from apps
    xi.length = 0;
    used.clear();
    const g = take(gks, 1)[0];
    xi.push({ no: g.no, pos: "GK", name: g.name });
    const cbs = take(dfs, 3);
    cbs.forEach((p) => xi.push({ no: p.no, pos: "CB", name: p.name }));
    const wide = take(dfs, 2);
    const mids = take(mfs, 4);
    xi.push({ no: (wide[0] || mids[0]).no, pos: "RM", name: (wide[0] || mids[0]).name });
    xi.push({ no: mids[0].no, pos: "CM", name: mids[0].name });
    xi.push({ no: mids[1].no, pos: "CM", name: mids[1].name });
    xi.push({ no: (wide[1] || mids[2]).no, pos: "LM", name: (wide[1] || mids[2]).name });
    const ams = take(mfs, 2);
    ams.forEach((p) => xi.push({ no: p.no, pos: "AM", name: p.name }));
    const st = take(fws, 1)[0];
    if (st) xi.push({ no: st.no, pos: "ST", name: st.name });
  } else {
    // 4-2-3-1 default
    const dms = take(mfs, 2);
    while (dms.length < 2) {
      const f = take(dfs, 1)[0];
      if (!f) break;
      dms.push(f);
    }
    dms.forEach((p) => xi.push({ no: p.no, pos: "DM", name: p.name }));
    const pool = () =>
      [...mfs, ...fws].filter((p) => !used.has(p.no)).sort((a, b) => b.apps - a.apps || a.no - b.no);
    const pick = (preferFw = false) => {
      const list = preferFw
        ? [...fws, ...mfs].filter((p) => !used.has(p.no)).sort((a, b) => b.apps - a.apps || a.no - b.no)
        : pool();
      const p = list[0];
      if (!p) return null;
      used.add(p.no);
      return p;
    };
    const ram = pick(false);
    const cam = pick(false);
    const lam = pick(false);
    const st = pick(true);
    if (ram) xi.push({ no: ram.no, pos: "RW", name: ram.name });
    if (cam) xi.push({ no: cam.no, pos: "AM", name: cam.name });
    if (lam) xi.push({ no: lam.no, pos: "LW", name: lam.name });
    if (st) xi.push({ no: st.no, pos: "ST", name: st.name });
  }

  // Captain: most apps among outfield XI
  let capIdx = 1;
  let best = -1;
  for (let i = 1; i < Math.min(11, xi.length); i++) {
    const p = players.find((x) => x.no === xi[i].no);
    const a = p?.apps ?? 0;
    if (a > best) {
      best = a;
      capIdx = i;
    }
  }
  xi[capIdx].captain = true;

  // Bench to ~18
  const bench = [];
  for (const p of [...gks, ...dfs, ...mfs, ...fws]) {
    if (used.has(p.no)) continue;
    const pos = detailedPos(p.band, p.band === "MF" ? "CM" : p.band === "DF" ? "CB" : undefined);
    bench.push({ no: p.no, pos, name: p.name });
    used.add(p.no);
    if (xi.length + bench.length >= 18) break;
  }

  const rows = [...xi.slice(0, 11), ...bench];
  return rows
    .map((r, i) => `${r.no}${r.captain ? "*" : ""} ${r.pos} ${r.name}`)
    .join(";");
}

function replaceSquadInSource(source, clubId, newSquad) {
  // Match: c("id", ... "formation",\n    "OLD_SQUAD"
  const idRe = clubId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(c\\("${idRe}"[\\s\\S]*?\\n\\s*")([^"]+)(")`,
    "m",
  );
  // More precise: the squad is the long quoted string after formation
  const re2 = new RegExp(
    `(c\\("${idRe}",\\s*"[^"]+",\\s*"[^"]+",\\s*"[^"]+",\\s*"[^"]+",\\s*"[^"]+",\\s*"[^"]+",\\s*"[^"]+",\\s*\\d+,\\s*"[^"]+",\\s*"[^"]+",\\s*"[^"]+",\\s*\\n\\s*")([^"]+)(")`,
  );
  if (!re2.test(source)) {
    throw new Error(`Could not locate squad string for ${clubId}`);
  }
  return source.replace(re2, `$1${newSquad}$3`);
}

async function main() {
  let source = fs.readFileSync(clubsPath, "utf8");
  const targets = CLUBS.filter((c) => {
    if (SKIP.has(c.id)) return false;
    if (only && !only.has(c.id)) return false;
    return true;
  });

  let ok = 0;
  let fail = 0;
  const report = [];

  for (const club of targets) {
    try {
      let squad;
      let sourceTag;
      if (MANUAL[club.id]) {
        squad = MANUAL[club.id].squad;
        sourceTag = "manual";
      } else {
        const page = WIKI_PAGE[club.id];
        if (!page) throw new Error("no wiki mapping");
        const fetched = await fetchWiki(page, club.id);
        squad = buildSquadString(fetched.players, club.formation);
        const tag = fetched.title.includes("2025")
          ? "wiki25"
          : fetched.title.includes("F.C.") && !fetched.title.includes("–")
            ? "club"
            : "wiki";
        sourceTag = `${tag}:${fetched.players.length}`;
        await sleep(1800);
      }

      // sanity: 11+ rows
      const rows = squad.split(";").filter(Boolean);
      if (rows.length < 14) throw new Error(`short squad ${rows.length}`);

      if (!dry) source = replaceSquadInSource(source, club.id, squad);
      console.log(`  ok  ${club.id.padEnd(36)} ← ${sourceTag} (${rows.length})`);
      report.push({ id: club.id, ok: true, sourceTag, n: rows.length });
      ok++;
    } catch (err) {
      console.warn(`  fail ${club.id}  ${err.message}`);
      report.push({ id: club.id, ok: false, err: err.message });
      fail++;
      await sleep(200);
    }
  }

  if (!dry) {
    fs.writeFileSync(clubsPath, source);
    fs.writeFileSync(
      path.join(root, "scripts", "squad-refresh-report.json"),
      JSON.stringify({ at: new Date().toISOString(), ok, fail, report }, null, 2),
    );
  }

  console.log(`Done. ok=${ok} fail=${fail}${dry ? " (dry)" : ""}`);
  if (fail && ok === 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
