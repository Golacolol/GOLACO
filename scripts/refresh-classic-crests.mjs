#!/usr/bin/env node
/**
 * Refresh classic / national crests:
 *  - FIFA national badges from TheSportsDB (same source as working France crest)
 *  - Era club badges from FootyLogos historical PNGs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "assets", "crests");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Nation search query → classic team ids (year-specific + short alias). */
const NATIONS = {
  England: ["classic_england_1996", "classic_england_2002", "classic_england"],
  France: ["classic_france_2000", "classic_france_1998", "classic_france"],
  Spain: ["classic_spain_2010", "classic_spain_2008", "classic_spain"],
  Brazil: ["classic_brazil_1994", "classic_brazil_2002", "classic_brazil_1982", "classic_brazil"],
  Argentina: ["classic_argentina_1986", "classic_argentina_2022", "classic_argentina"],
  Germany: ["classic_germany_1990", "classic_germany_2014", "classic_germany"],
  Italy: ["classic_italy_1982", "classic_italy_2006", "classic_italy"],
  Netherlands: ["classic_netherlands_1988", "classic_netherlands_2010", "classic_netherlands"],
  Portugal: ["classic_portugal_2016", "classic_portugal"],
  Croatia: ["classic_croatia_1998", "classic_croatia"],
  Denmark: ["classic_denmark_1992", "classic_denmark"],
  Greece: ["classic_greece_2004", "classic_greece"],
  Uruguay: ["classic_uruguay_2011", "classic_uruguay"],
  Cameroon: ["classic_cameroon_1990", "classic_cameroon"],
};

/** FootyLogos historical paths → classic team ids */
const ERA_LOGOS = [
  {
    url: "https://www.footylogos.com/dls/logo/juventus/1989-2004.png",
    ids: ["classic_juventus_1995_96", "classic_juventus_1997_98", "classic_juventus"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/juventus/1982.png",
    ids: ["classic_juventus_1982_83"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/juventus/2004-2017.png",
    ids: ["classic_juventus_2016_17"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/ac-milan/1979-1986-diavoletto.png",
    ids: ["classic_milan_1988_89", "classic_milan_1993_94"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/inter-milan/two-stars.png",
    ids: [
      "classic_inter_1997_98",
      "classic_inter_1988_89",
      "classic_inter_2009_10",
      "classic_inter_1993_94",
      "classic_inter",
    ],
  },
  {
    url: "https://www.footylogos.com/dls/logo/lazio.png",
    ids: ["classic_lazio_1999_00", "classic_lazio_1992_93", "classic_lazio"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/roma.png",
    ids: ["classic_roma_2000_01", "classic_roma_1992_93", "classic_roma"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/ipswich-town.png",
    ids: ["classic_ipswich_1980_81", "classic_ipswich"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/fiorentina/2003-2022.png",
    ids: ["classic_fiorentina_1998_99"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/boca-juniors.png",
    ids: ["classic_boca_2000", "classic_boca"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/river-plate.png",
    ids: ["classic_river_1986", "classic_river"],
  },
  {
    url: "https://www.footylogos.com/dls/logo/flamengo.png",
    ids: ["classic_flamengo_1981", "classic_flamengo"],
  },
];

/** Direct PNG fallbacks when SportsDB is rate-limited (api-sports team badges). */
const NATION_PNG = {
  Denmark: { ids: ["classic_denmark_1992", "classic_denmark"], url: "https://media.api-sports.io/football/teams/21.png" },
  Greece: { ids: ["classic_greece_2004", "classic_greece"], url: "https://media.api-sports.io/football/teams/32.png" },
  Uruguay: { ids: ["classic_uruguay_2011", "classic_uruguay"], url: "https://media.api-sports.io/football/teams/7.png" },
  Cameroon: { ids: ["classic_cameroon_1990", "classic_cameroon"], url: "https://media.api-sports.io/football/teams/31.png" },
};

/** SportsDB club search fallbacks when FootyLogos path 404s. */
const CLUB_SEARCH = [
  { query: "Boca Juniors", ids: ["classic_boca_2000", "classic_boca"] },
  { query: "River Plate", ids: ["classic_river_1986", "classic_river"] },
  { query: "Flamengo", ids: ["classic_flamengo_1981", "classic_flamengo"] },
];

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": "FPC-classic-crests/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 400) throw new Error(`tiny ${url}`);
  return buf;
}

async function sportsDbBadge(query, preferNational = false) {
  const url = `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "FPC-classic-crests/1.0" } });
  if (!res.ok) throw new Error(`SportsDB ${res.status}`);
  const json = await res.json();
  const teams = json.teams || [];
  const team =
    (preferNational
      ? teams.find((t) => t.strTeam === query && /World Cup|International/i.test(t.strLeague || ""))
      : null) ||
    teams.find((t) => t.strTeam === query) ||
    teams[0];
  const badge = team?.strBadge || team?.strTeamBadge;
  if (!badge) throw new Error(`no badge for ${query}`);
  return download(badge);
}

function writeIds(ids, bytes) {
  for (const id of ids) {
    fs.writeFileSync(path.join(outDir, `${id}.png`), bytes);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  let ok = 0;
  let fail = 0;
  const written = new Set();

  for (const [nation, ids] of Object.entries(NATIONS)) {
    try {
      const bytes = await sportsDbBadge(nation, true);
      writeIds(ids, bytes);
      for (const id of ids) written.add(id);
      console.log(`  ok  ${nation.padEnd(12)} → ${ids.join(", ")} (${bytes.length}b)`);
      ok += ids.length;
      await sleep(900);
    } catch (err) {
      const alt = NATION_PNG[nation];
      if (alt) {
        try {
          const bytes = await download(alt.url);
          writeIds(alt.ids, bytes);
          for (const id of alt.ids) written.add(id);
          console.log(`  ok  ${nation.padEnd(12)} → ${alt.ids.join(", ")} (api-sports fallback)`);
          ok += alt.ids.length;
          await sleep(400);
          continue;
        } catch (altErr) {
          console.warn(`  fail ${nation} fallback ${altErr.message}`);
        }
      }
      console.warn(`  fail ${nation}  ${err.message}`);
      fail++;
      await sleep(1500);
    }
  }

  for (const entry of ERA_LOGOS) {
    try {
      const bytes = await download(entry.url);
      writeIds(entry.ids, bytes);
      for (const id of entry.ids) written.add(id);
      console.log(`  ok  era ${path.basename(entry.url)} → ${entry.ids.join(", ")}`);
      ok += entry.ids.length;
      await sleep(400);
    } catch (err) {
      console.warn(`  fail era ${entry.url}  ${err.message}`);
      fail++;
    }
  }

  for (const club of CLUB_SEARCH) {
    if (club.ids.every((id) => written.has(id))) continue;
    try {
      const bytes = await sportsDbBadge(club.query, false);
      const need = club.ids.filter((id) => !written.has(id));
      writeIds(need, bytes);
      for (const id of need) written.add(id);
      console.log(`  ok  club ${club.query} → ${need.join(", ")}`);
      ok += need.length;
      await sleep(900);
    } catch (err) {
      console.warn(`  fail club ${club.query}  ${err.message}`);
      fail++;
      await sleep(1500);
    }
  }

  console.log(`Done. wrote=${ok} failed-groups=${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
