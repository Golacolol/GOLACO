#!/usr/bin/env node
/**
 * Download freely licensed player portraits from Wikimedia Commons / Wikipedia.
 *
 * Only keeps images whose license metadata is Public Domain / CC0 / CC BY(+SA)
 * (not NC). Writes public/assets/players/{playerId}.jpg + ATTRIBUTIONS.md.
 * Never scrapes commercial photo sites.
 *
 * Resolves abbreviated squad names (e.g. "M. Cooper") to openfootball full names
 * before searching, and requires first+surname match on the file title.
 *
 * Usage:
 *   node scripts/import-player-portraits.mjs --limit 25
 *   node scripts/import-player-portraits.mjs --only plymouth_argyle_current --limit 12
 *   node scripts/import-player-portraits.mjs --classic --limit 40
 *   node scripts/import-player-portraits.mjs --classic --only classic_lazio_1992_93 --limit 20
 *   node scripts/import-player-portraits.mjs --dry --limit 5
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { findBioForPlayer, parseOpenfootballPlayersText } from "./lib/openfootballBios.mjs";
import { isFootballPortrait, nameInTitle } from "./lib/portraitMatch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const playersFile = join(root, "public", "data", "players.json");
const membershipsFile = join(root, "public", "data", "teamMemberships.json");
const outDir = join(root, "public", "assets", "players");
const attrFile = join(outDir, "ATTRIBUTIONS.md");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const useClassic = args.includes("--classic");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Math.max(1, Number(args[limitIdx + 1]) || 20) : 20;
const onlyIdx = args.indexOf("--only");
const onlyTeam = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const UA =
  "ArgyleFootballPortraitBot/1.0 (educational fan project; honors Commons licenses; contact: local)";

const FREE_LICENSE = /^(public domain|pd|cc0|cc[- ]?by\b(?!.*\bnc\b)|cc[- ]?by[- ]sa)/i;

const OF_FILES = [
  "europe/england/eng.players.txt",
  "europe/scotland/sco.players.txt",
  "europe/wales/wal.players.txt",
  "europe/spain/es.players.txt",
  "europe/italy/it.players.txt",
  "europe/france/fr.players.txt",
  "europe/germany/de.players.txt",
  "europe/netherlands/nl.players.txt",
  "europe/switzerland/ch.players.txt",
  "europe/ireland/ie.players.txt",
  "europe/croatia/hr.players.txt",
  "europe/serbia/rs.players.txt",
  "south-america/argentina/ar.players.txt",
  "south-america/brazil/br.players.txt",
  "africa/nigeria/ng.players.txt",
  "africa/ghana/gh.players.txt",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function wikiFetch(url, attempt = 0) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 && attempt < 6) {
    const wait = 4000 * (attempt + 1) * (attempt + 1);
    console.warn(`    rate-limit, wait ${wait}ms`);
    await sleep(wait);
    return wikiFetch(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadBioIndex() {
  const bioIndex = new Map();
  const base = "https://raw.githubusercontent.com/openfootball/players/master/";
  for (const path of OF_FILES) {
    try {
      const res = await fetch(base + path, { headers: { "User-Agent": UA } });
      if (!res.ok) continue;
      const part = parseOpenfootballPlayersText(await res.text());
      for (const [k, v] of part) {
        if (!bioIndex.has(k)) bioIndex.set(k, v);
      }
    } catch {
      /* skip nation file */
    }
  }
  return bioIndex;
}

function searchNameFor(player, bioIndex) {
  const existing = player.appearance?.fullName?.trim();
  if (existing && existing.split(/\s+/).length >= 2 && existing.replace(/\./g, "").length > 4) {
    return existing;
  }
  const bio = findBioForPlayer(player, bioIndex);
  if (bio?.name) return bio.name;
  const n = String(player.name || "").trim();
  // Refuse initial-only searches — they collide heavily on Commons.
  const parts = n.replace(/\./g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0].length === 1) return null;
  return n.length >= 4 ? n : null;
}

async function wikipediaPageImages(fullName) {
  // Only footballer/soccer disambiguation pages — bare name redirects to the wrong person often.
  const titles = [`${fullName} (footballer)`, `${fullName} (soccer)`, fullName];
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      formatversion: "2",
      prop: "pageimages",
      titles: titles.join("|"),
      piprop: "original|name",
      pithumbsize: "512",
      redirects: "1",
    });
  const json = await wikiFetch(url);
  const out = [];
  for (const page of json.query?.pages ?? []) {
    if (page.missing || page.pageimage == null) continue;
    const pageTitle = page.title || "";
    const footballerPage = /\((footballer|soccer)\)/i.test(pageTitle);
    if (!footballerPage && !nameInTitle(fullName, pageTitle)) continue;
    if (!nameInTitle(fullName, pageTitle) && !footballerPage) continue;
    // Still require the resolved page to be about this person.
    if (!nameInTitle(fullName, pageTitle)) continue;
    const file = page.pageimage.startsWith("File:") ? page.pageimage : `File:${page.pageimage}`;
    // Mark wiki pageimages so we can skip redundant file-title checks (page already verified).
    out.push({ title: file, fromWikiPage: true });
  }
  return out;
}

async function commonsSearch(fullName) {
  const queries = [
    `"${fullName}" (footballer OR soccer OR football)`,
    `${fullName} footballer`,
  ];
  const seen = new Set();
  const out = [];
  for (const srsearch of queries) {
    const url =
      "https://commons.wikimedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        format: "json",
        origin: "*",
        list: "search",
        srsearch,
        srnamespace: "6",
        srlimit: "8",
      });
    const json = await wikiFetch(url);
    for (const s of json.query?.search ?? []) {
      if (seen.has(s.title)) continue;
      seen.add(s.title);
      out.push({ title: s.title, fromWikiPage: false });
    }
    await sleep(400);
  }
  return out;
}

async function commonsImageInfo(title) {
  const hosts = ["commons.wikimedia.org", "en.wikipedia.org"];
  for (const host of hosts) {
    const url =
      `https://${host}/w/api.php?` +
      new URLSearchParams({
        action: "query",
        format: "json",
        origin: "*",
        formatversion: "2",
        prop: "imageinfo",
        titles: title.startsWith("File:") ? title : `File:${title}`,
        iiprop: "url|extmetadata|size|mime",
        iiurlwidth: "512",
        iiextmetadatafilter:
          "LicenseShortName|LicenseUrl|Artist|Credit|Attribution|ImageDescription|ObjectName",
      });
    try {
      const json = await wikiFetch(url);
      const page = json.query?.pages?.[0];
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata || {};
      const license = meta.LicenseShortName?.value || "";
      const artist = (meta.Artist?.value || meta.Credit?.value || meta.Attribution?.value || "")
        .replace(/<[^>]+>/g, "")
        .trim();
      const description = (meta.ImageDescription?.value || "").replace(/<[^>]+>/g, " ").trim();
      const objectName = (meta.ObjectName?.value || "").replace(/<[^>]+>/g, " ").trim();
      return {
        title: page.title || title,
        license,
        licenseUrl: meta.LicenseUrl?.value || "",
        artist,
        description,
        objectName,
        thumbUrl: info.thumburl || info.url,
        mime: info.mime || "",
        free: FREE_LICENSE.test(license),
      };
    } catch {
      /* try next host */
    }
  }
  return null;
}

/** Load classic squad players via tsx (definitions live in TypeScript). */
function loadClassicPlayers(teamFilter) {
  const script = `
    import { CLASSIC_TEAM_DEFINITIONS } from ${JSON.stringify(join(root, "src/data/classicTeams/index.ts"))};
    const filter = ${JSON.stringify(teamFilter)};
    const out = [];
    for (const def of CLASSIC_TEAM_DEFINITIONS) {
      if (filter && def.teamId !== filter) continue;
      for (const p of def.players) {
        out.push({
          id: p.id,
          name: p.name,
          displayName: p.displayName,
          appearance: { fullName: p.name, portraitAsset: null },
        });
      }
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const res = spawnSync("npx", ["tsx", "-e", script], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`classic load failed: ${res.stderr || res.stdout}`);
  }
  const line = (res.stdout || "").trim().split("\n").filter(Boolean).pop();
  return JSON.parse(line || "[]");
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log("Loading openfootball name index…");
  const bioIndex = await loadBioIndex();
  console.log(`  ${bioIndex.size} name keys`);

  let queue;
  let persistJson = !useClassic;
  if (useClassic) {
    console.log("Loading classic team squads…");
    queue = loadClassicPlayers(onlyTeam);
    console.log(`  ${queue.length} classic players${onlyTeam ? ` (${onlyTeam})` : ""}`);
  } else {
    const players = JSON.parse(readFileSync(playersFile, "utf8"));
    const memberships = JSON.parse(readFileSync(membershipsFile, "utf8"));
    let ids = players.map((p) => p.id);
    if (onlyTeam) {
      const allowed = new Set(
        memberships.filter((m) => m.teamId === onlyTeam).map((m) => m.playerId),
      );
      ids = ids.filter((id) => allowed.has(id));
    }
    const byId = new Map(players.map((p) => [p.id, p]));
    queue = ids.map((id) => byId.get(id)).filter(Boolean);
  }

  if (!existsSync(attrFile) && !dry) {
    writeFileSync(
      attrFile,
      `# Player portrait attributions\n\nDownloaded from Wikimedia Commons / Wikipedia.\nOnly Public Domain / CC0 / CC BY(+SA) images (no NC).\n\n`,
    );
  }

  let saved = 0;
  let attempted = 0;
  const jsonPlayers = persistJson ? JSON.parse(readFileSync(playersFile, "utf8")) : null;
  const jsonById = jsonPlayers ? new Map(jsonPlayers.map((p) => [p.id, p])) : null;

  for (const player of queue) {
    if (saved >= limit) break;
    const destJpg = join(outDir, `${player.id}.jpg`);
    const destPng = join(outDir, `${player.id}.png`);
    if (existsSync(destJpg) || existsSync(destPng)) {
      console.log(`  have ${player.id}`);
      continue;
    }
    const fullName = searchNameFor(player, bioIndex) || player.appearance?.fullName || player.name;
    if (!fullName || String(fullName).replace(/\./g, " ").trim().split(/\s+/).length < 2) {
      console.log(`  skip ${player.name} (no full name)`);
      continue;
    }
    if (player.appearance?.fullName !== fullName) {
      player.appearance = { ...(player.appearance || {}), fullName };
    }
    attempted++;
    try {
      const candidates = [
        ...(await wikipediaPageImages(fullName)),
        ...(await commonsSearch(fullName)),
      ];
      await sleep(1800);
      let picked = null;
      for (const cand of candidates) {
        const title = typeof cand === "string" ? cand : cand.title;
        const fromWikiPage = typeof cand === "object" && cand.fromWikiPage;
        // Commons hits must name-match the file; wiki pageimages already matched the person page.
        if (!fromWikiPage && !nameInTitle(fullName, title)) continue;
        const info = await commonsImageInfo(title);
        await sleep(1400);
        if (!info || !info.free || !info.thumbUrl) continue;
        if (!String(info.mime).startsWith("image/")) continue;
        if (!fromWikiPage && !isFootballPortrait(info)) continue;
        // Wiki pageimage still needs football context or a free portrait license (already free=true).
        if (fromWikiPage && !isFootballPortrait(info) && !/\b(footballer|soccer|football)\b/i.test(info.title || "")) {
          // Allow free-licensed headshots from the footballer article even if metadata is sparse.
          if (!FREE_LICENSE.test(info.license)) continue;
        }
        picked = info;
        break;
      }
      if (!picked) {
        console.log(`  miss ${fullName}`);
        continue;
      }
      console.log(`  ok ${fullName} ← ${picked.title} (${picked.license})`);
      if (dry) {
        saved++;
        continue;
      }
      const imgRes = await fetch(picked.thumbUrl, { headers: { "User-Agent": UA } });
      if (!imgRes.ok) throw new Error(`download ${imgRes.status}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length < 800) throw new Error("tiny image");
      const ext = String(picked.mime).includes("png") ? "png" : "jpg";
      const dest = join(outDir, `${player.id}.${ext}`);
      writeFileSync(dest, buf);
      const assetPath = `/assets/players/${player.id}.${ext}`;
      player.appearance = {
        ...(player.appearance || {}),
        fullName,
        portraitAsset: player.appearance?.portraitAsset || assetPath,
      };
      if (jsonById?.has(player.id)) {
        const rec = jsonById.get(player.id);
        rec.appearance = {
          ...(rec.appearance || {}),
          fullName,
          portraitAsset: rec.appearance?.portraitAsset || assetPath,
        };
      }
      appendFileSync(
        attrFile,
        `- **${fullName}** (\`${player.id}\`): ${picked.title} — ${picked.license}` +
          (picked.artist ? ` — ${picked.artist}` : "") +
          (picked.licenseUrl ? ` — ${picked.licenseUrl}` : "") +
          `\n`,
      );
      saved++;
      await sleep(2000);
    } catch (err) {
      console.warn(`  fail ${fullName}: ${err instanceof Error ? err.message : err}`);
      await sleep(2500);
    }
  }

  if (!dry && persistJson && jsonPlayers) {
    writeFileSync(playersFile, `${JSON.stringify(jsonPlayers, null, 2)}\n`);
  }
  console.log(`Portraits saved ${saved}/${attempted} attempted (limit ${limit})${dry ? " [dry]" : ""}`);
  if (saved === 0) {
    console.log(
      "Tip: Commons often rate-limits or fair-use-only images; re-run later, or drop PNGs into public/assets/players/{playerId}.png",
    );
  }
}

await main();
