#!/usr/bin/env node
/**
 * Kit pack importer → public/assets/kits/{teamId}_{home|away}.png
 *
 * Sources (in order per variant):
 *   1. Sibling kit already on disk (shared club key)
 *   2. --local /path/to/pack  ({club}_home.png / {club}_away.png)
 *   3. TheSportsDB strEquipment (current 1st) + lookupequipment 1st/2nd
 *   4. Procedural jersey generated from teams.json kit colours
 *
 * Usage:
 *   npm run assets:kits
 *   npm run assets:kits -- --force
 *   npm run assets:kits -- --current-only
 *   node scripts/import-kits.mjs --local /path/to/kits
 *
 * Club trademarks remain with their owners — keep packs private / personal use.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "assets", "kits");
const teamsPath = path.join(root, "public", "data", "teams.json");
const classicTeamsDir = path.join(root, "src", "data", "classicTeams");
const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/123";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const force = args.includes("--force");
const currentOnly = args.includes("--current-only");
const localIdx = args.indexOf("--local");
const localDir = localIdx >= 0 ? path.resolve(args[localIdx + 1] ?? "") : null;

/** Club key → TheSportsDB search (mirrors import-crests). */
const SEARCH_BY_CLUB = {
  plymouth_argyle: "Plymouth Argyle",
  plymouth: "Plymouth Argyle",
  barnsley: "Barnsley",
  arsenal: "Arsenal",
  aston_villa: "Aston Villa",
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
  blackburn_rovers: "Blackburn Rovers",
  bolton_wanderers: "Bolton Wanderers",
  bristol_city: "Bristol City",
  burnley: "Burnley",
  cardiff_city: "Cardiff City",
  charlton_athletic: "Charlton Athletic",
  derby_county: "Derby County",
  lincoln_city: "Lincoln City",
  middlesbrough: "Middlesbrough",
  millwall: "Millwall",
  norwich_city: "Norwich City",
  portsmouth: "Portsmouth",
  preston_north_end: "Preston North End",
  queens_park_rangers: "Queens Park Rangers",
  qpr: "Queens Park Rangers",
  sheffield_united: "Sheffield United",
  stoke_city: "Stoke City",
  swansea_city: "Swansea City",
  watford: "Watford",
  west_bromwich_albion: "West Brom",
  west_ham_united: "West Ham",
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
  leyton_orient: "Leyton Orient",
  luton_town: "Luton Town",
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
  psg: "Paris SG",
  monaco: "Monaco",
  ajax: "Ajax",
  porto: "Porto",
  celtic: "Celtic",
  rangers: "Rangers",
  england: "England",
  france: "France",
  spain: "Spain",
  brazil: "Brazil",
  argentina: "Argentina",
};

function clubKeyFromTeamId(teamId) {
  let id = teamId.replace(/^classic_/, "").replace(/_current$/, "");
  id = id.replace(/_\d{4}_\d{2}$/, "").replace(/_\d{4}$/, "");
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
    if (currentOnly && t.teamType && t.teamType !== "CURRENT_TEAM" && !t.id.endsWith("_current") && t.id !== "argyle_fans_xi") {
      continue;
    }
    seen.add(t.id);
    targets.push({ id: t.id, record: t });
  }
  if (!currentOnly) {
    for (const id of collectClassicTeamIds()) {
      if (seen.has(id)) continue;
      seen.add(id);
      targets.push({ id, record: null });
    }
  }
  return targets;
}

function groupByClub(targets) {
  /** @type {Map<string, { ids: string[], record: any }>} */
  const groups = new Map();
  for (const t of targets) {
    const key = clubKeyFromTeamId(t.id);
    if (!groups.has(key)) groups.set(key, { ids: [], record: t.record });
    const g = groups.get(key);
    g.ids.push(t.id);
    if (!g.record && t.record) g.record = t.record;
  }
  return groups;
}

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { "User-Agent": "FPC-kit-import/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) throw new Error(`tiny ${url}`);
  return buf;
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

async function sportsDbJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { "User-Agent": "FPC-kit-import/1.0" } });
  if (res.status === 429) {
    if (attempt >= 8) throw new Error("SportsDB rate limit");
    const wait = 5000 * attempt;
    console.warn(`    rate-limit, wait ${wait}ms`);
    await sleep(wait);
    return sportsDbJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`SportsDB ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (attempt >= 6) throw new Error("SportsDB bad JSON");
    await sleep(3000 * attempt);
    return sportsDbJson(url, attempt + 1);
  }
}

function seasonRank(season) {
  const m = String(season || "").match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function pickEquipmentUrl(equipment, type) {
  const typed = (equipment || []).filter((e) => (e.strType || "").toLowerCase() === type && e.strEquipment);
  if (!typed.length) return null;
  typed.sort((a, b) => seasonRank(b.strSeason) - seasonRank(a.strSeason));
  return typed[0].strEquipment;
}

async function resolveSportsDbKits(club, cache) {
  if (cache.has(club)) return cache.get(club);
  const query = SEARCH_BY_CLUB[club] || club.replace(/_/g, " ");
  const search = await sportsDbJson(`${SPORTSDB}/searchteams.php?t=${encodeURIComponent(query)}`);
  await sleep(1700);
  const team = pickSportsDbTeam(search.teams, query);
  if (!team?.idTeam) {
    cache.set(club, { homeUrl: null, awayUrl: null });
    return cache.get(club);
  }
  let homeUrl = team.strEquipment || null;
  let awayUrl = null;
  try {
    const eq = await sportsDbJson(`${SPORTSDB}/lookupequipment.php?id=${team.idTeam}`);
    await sleep(1700);
    const first = pickEquipmentUrl(eq.equipment, "1st");
    const second = pickEquipmentUrl(eq.equipment, "2nd");
    if (first) homeUrl = first;
    if (second) awayUrl = second;
  } catch (err) {
    console.warn(`    equipment miss ${club}: ${err.message}`);
  }
  const out = { homeUrl, awayUrl, teamName: team.strTeam };
  cache.set(club, out);
  return out;
}

function kitPath(teamId, variant) {
  return path.join(outDir, `${teamId}_${variant}.png`);
}

function present(teamId, variant) {
  const p = kitPath(teamId, variant);
  return fs.existsSync(p) && fs.statSync(p).size > 200;
}

function findSibling(teamIds, variant) {
  for (const id of teamIds) {
    if (present(id, variant)) return fs.readFileSync(kitPath(id, variant));
  }
  return null;
}

function writeAll(teamIds, variant, bytes) {
  for (const id of teamIds) {
    fs.writeFileSync(kitPath(id, variant), bytes);
  }
}

function listLocalFiles(dir) {
  const map = new Map();
  if (!dir || !fs.existsSync(dir)) return map;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(png|webp|jpg|jpeg)$/i.test(name)) continue;
    map.set(name.replace(/\.[^.]+$/, "").toLowerCase(), path.join(dir, name));
  }
  return map;
}

function fromLocal(club, teamIds, variant, localFiles) {
  if (!localFiles?.size) return null;
  const keys = [
    `${club}_${variant}`,
    `${club} ${variant}`,
    `${club}-${variant}`,
    ...teamIds.map((id) => `${id}_${variant}`),
  ];
  for (const k of keys) {
    const hit = localFiles.get(k.toLowerCase().replace(/\s+/g, "_"));
    if (hit) return fs.readFileSync(hit);
    const spaced = localFiles.get(k.toLowerCase());
    if (spaced) return fs.readFileSync(spaced);
  }
  return null;
}

/** Procedural wrap jersey via Pillow (always available fallback). */
function generateProceduralKit(record, variant) {
  const kit = variant === "away" ? record?.awayKit || record?.defaultKit : record?.defaultKit;
  if (!kit?.shirt) return null;
  const shirt = kit.shirt || "#333333";
  const trim = kit.trim || kit.numberColor || record?.secondaryColor || "#ffffff";
  const socks = kit.socks || shirt;
  const py = `
from PIL import Image, ImageDraw
img = Image.new("RGB", (512, 512), "${shirt}")
d = ImageDraw.Draw(img)
trim = "${trim}"
for x in range(24, 512, 56):
    d.rectangle([x, 0, x+20, 512], fill=trim)
d.rectangle([0, 0, 512, 40], fill=trim)
d.rectangle([0, 472, 512, 512], fill=trim)
overlay = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
od.rectangle([0, 120, 512, 280], fill=(255, 255, 255, 28))
img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
d = ImageDraw.Draw(img)
d.rectangle([0, 430, 512, 455], fill="${socks}")
img.save(${JSON.stringify(path.join(outDir, "_tmp_gen.png"))}, "PNG")
`;
  const tmpPy = path.join(outDir, "_gen_kit.py");
  const tmpPng = path.join(outDir, "_tmp_gen.png");
  fs.writeFileSync(tmpPy, py);
  const run = spawnSync("python3", [tmpPy], { encoding: "utf8" });
  try {
    fs.unlinkSync(tmpPy);
  } catch {
    /* ignore */
  }
  if (run.status !== 0 || !fs.existsSync(tmpPng)) {
    console.warn(`    procedural fail: ${run.stderr || run.stdout}`);
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

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const targets = buildTargets();
  const groups = groupByClub(targets);
  const localFiles = localDir ? listLocalFiles(localDir) : null;
  const sportsCache = new Map();
  let ok = 0;
  let skip = 0;
  let fail = 0;

  console.log(`Kits → ${outDir}`);
  console.log(`Clubs ${groups.size} (${targets.length} team ids)${localDir ? ` local=${localDir}` : ""}${force ? " --force" : ""}`);

  for (const [club, group] of groups) {
    const { ids, record } = group;
    const needHome = force || ids.some((id) => !present(id, "home"));
    const needAway = force || ids.some((id) => !present(id, "away"));
    if (!needHome && !needAway) {
      skip += ids.length * 2;
      continue;
    }

    let homeBytes = null;
    let awayBytes = null;
    let homeSrc = "";
    let awaySrc = "";

    try {
      if (needHome && !force) {
        homeBytes = findSibling(ids, "home");
        if (homeBytes) homeSrc = "sibling";
      }
      if (needAway && !force) {
        awayBytes = findSibling(ids, "away");
        if (awayBytes) awaySrc = "sibling";
      }
      if (needHome && !homeBytes && localFiles) {
        homeBytes = fromLocal(club, ids, "home", localFiles);
        if (homeBytes) homeSrc = "local";
      }
      if (needAway && !awayBytes && localFiles) {
        awayBytes = fromLocal(club, ids, "away", localFiles);
        if (awayBytes) awaySrc = "local";
      }

      if ((needHome && !homeBytes) || (needAway && !awayBytes)) {
        const remote = await resolveSportsDbKits(club, sportsCache);
        if (needHome && !homeBytes && remote.homeUrl) {
          homeBytes = await fetchBytes(remote.homeUrl);
          homeSrc = "sportsdb-1st";
          await sleep(400);
        }
        if (needAway && !awayBytes && remote.awayUrl) {
          awayBytes = await fetchBytes(remote.awayUrl);
          awaySrc = "sportsdb-2nd";
          await sleep(400);
        }
      }

      if (needHome && !homeBytes && record) {
        homeBytes = generateProceduralKit(record, "home");
        if (homeBytes) homeSrc = "procedural";
      }
      if (needAway && !awayBytes && record) {
        awayBytes = generateProceduralKit(record, "away");
        if (awayBytes) awaySrc = "procedural";
      }

      if (needHome) {
        if (!homeBytes) {
          console.warn(`  miss  ${club} home`);
          fail += ids.length;
        } else {
          writeAll(ids, "home", homeBytes);
          console.log(`  home  ${club.padEnd(28)} ← ${homeSrc}  ×${ids.length}`);
          ok += ids.length;
        }
      } else {
        skip += ids.length;
      }

      if (needAway) {
        if (!awayBytes) {
          console.warn(`  miss  ${club} away`);
          fail += ids.length;
        } else {
          writeAll(ids, "away", awayBytes);
          console.log(`  away  ${club.padEnd(28)} ← ${awaySrc}  ×${ids.length}`);
          ok += ids.length;
        }
      } else {
        skip += ids.length;
      }
    } catch (err) {
      console.warn(`  fail  ${club}  ${err.message}`);
      fail += ids.length;
    }
  }

  console.log(`Done. wrote=${ok} skipped=${skip} failed=${fail}`);
  const homes = fs.readdirSync(outDir).filter((f) => f.endsWith("_home.png")).length;
  const aways = fs.readdirSync(outDir).filter((f) => f.endsWith("_away.png")).length;
  console.log(`On disk: ${homes} home, ${aways} away`);
  if (fail && ok === 0 && skip === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
