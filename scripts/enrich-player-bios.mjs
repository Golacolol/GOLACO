#!/usr/bin/env node
/**
 * Fill heightCm / age / weightKg (estimated) / birthplace from openfootball/players.
 *
 * Usage:
 *   node scripts/enrich-player-bios.mjs
 *   node scripts/enrich-player-bios.mjs --dry
 *   node scripts/enrich-player-bios.mjs --europe-only
 */
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyBioToPlayer,
  findBioForPlayer,
  parseOpenfootballPlayersText,
} from "./lib/openfootballBios.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const playersFile = join(root, "public", "data", "players.json");
const dry = process.argv.includes("--dry");

/** Priority nation files — England first so local names win collisions. */
const PLAYER_FILES = [
  "europe/england/eng.players.txt",
  "europe/scotland/sco.players.txt",
  "europe/wales/wal.players.txt",
  "europe/northern-ireland/nir.players.txt",
  "europe/ireland/ie.players.txt",
  "europe/france/fr.players.txt",
  "europe/germany/de.players.txt",
  "europe/spain/es.players.txt",
  "europe/italy/it.players.txt",
  "europe/portugal/pt.players.txt",
  "europe/netherlands/nl.players.txt",
  "europe/belgium/be.players.txt",
  "europe/denmark/dk.players.txt",
  "europe/sweden/se.players.txt",
  "europe/norway/no.players.txt",
  "europe/poland/pl.players.txt",
  "europe/croatia/hr.players.txt",
  "europe/serbia/rs.players.txt",
  "europe/austria/at.players.txt",
  "europe/switzerland/ch.players.txt",
  "south-america/brazil/br.players.txt",
  "south-america/argentina/ar.players.txt",
  "africa/nigeria/ng.players.txt",
  "africa/senegal/sn.players.txt",
  "africa/ghana/gh.players.txt",
  "africa/cote-d-ivoire/ci.players.txt",
  "africa/cameroon/cm.players.txt",
  "africa/mali/ml.players.txt",
  "south-america/uruguay/uy.players.txt",
  "south-america/colombia/co.players.txt",
];

const BASE = "https://raw.githubusercontent.com/openfootball/players/master/";

async function fetchText(path) {
  const res = await fetch(BASE + path, {
    headers: { "User-Agent": "argyle-football-bio-enrich/1.0" },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.text();
}

async function main() {
  const bioIndex = new Map();
  for (const path of PLAYER_FILES) {
    try {
      process.stdout.write(`  fetch ${path}… `);
      const text = await fetchText(path);
      const part = parseOpenfootballPlayersText(text);
      let added = 0;
      for (const [k, v] of part) {
        if (!bioIndex.has(k)) {
          bioIndex.set(k, v);
          added++;
        }
      }
      console.log(`+${added} keys (file had ${part.size})`);
    } catch (err) {
      console.warn(`skip (${err instanceof Error ? err.message : err})`);
    }
  }
  console.log(`Bio index size: ${bioIndex.size}`);

  const players = JSON.parse(readFileSync(playersFile, "utf8"));
  let matched = 0;
  let changed = 0;
  let withHeight = 0;
  const next = players.map((player) => {
    const bio = findBioForPlayer(player, bioIndex);
    if (!bio) return player;
    matched++;
    const result = applyBioToPlayer(player, bio);
    if (result.changed) changed++;
    if (result.player.heightCm) withHeight++;
    return result.player;
  });

  console.log(`Players ${players.length}; matched ${matched}; updated ${changed}; height filled ${withHeight}`);
  if (dry) {
    console.log("Dry run — not writing players.json");
    return;
  }
  writeFileSync(playersFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${playersFile}`);
}

await main();
