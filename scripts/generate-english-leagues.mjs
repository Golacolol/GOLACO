#!/usr/bin/env node
/**
 * Merges 2026/27 Premier League, Championship, League One, La Liga and Serie A
 * clubs into public/data/*.json without replacing the default Plymouth Argyle XI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLUBS } from "./english-clubs.mjs";
import { EUROPEAN_CLUBS } from "./european-clubs.mjs";

const ALL_CLUBS = [...CLUBS, ...EUROPEAN_CLUBS];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "public", "data");

const SLOTS = {
  "4-3-3": ["GK", "RB", "RCB", "LCB", "LB", "RCM", "CM", "LCM", "RW", "ST", "LW"],
  "4-2-3-1": ["GK", "RB", "RCB", "LCB", "LB", "RDM", "LDM", "RAM", "CAM", "LAM", "ST"],
  "4-4-2": ["GK", "RB", "RCB", "LCB", "LB", "RM", "RCM", "LCM", "LM", "RST", "LST"],
  "3-4-2-1": ["GK", "RCB", "CB", "LCB", "RM", "RCM", "LCM", "LM", "RAM", "LAM", "ST"],
};

const TIER = {
  PREMIER_LEAGUE: 82,
  CHAMPIONSHIP: 72,
  LEAGUE_ONE: 66,
  LA_LIGA: 82,
  SERIE_A: 82,
};

const POS = new Set(["GK", "RB", "CB", "LB", "RWB", "LWB", "DM", "CM", "AM", "RM", "LM", "RW", "LW", "ST"]);

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function displayName(full) {
  const parts = full.trim().split(/\s+/);
  const last = parts.slice(1).join(" ") || parts[0];
  return `${parts[0][0]}. ${last}`;
}

function slugName(full) {
  return full
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseRow(row) {
  const m = row.trim().match(/^(\d+)(\*)?\s+([A-Z]{2,3})\s+(.+)$/);
  if (!m) throw new Error(`Bad squad row: ${row}`);
  const pos = m[3];
  if (!POS.has(pos)) throw new Error(`Unknown position ${pos} in ${row}`);
  return { number: Number(m[1]), captain: m[2] === "*", pos, name: m[4].trim() };
}

function attrsFor(pos, overall, seed) {
  const j = (n) => ((seed >> n) & 7) - 3;
  const o = overall;
  const base = {
    pace: o - 4 + j(0),
    passing: o - 6 + j(3),
    longPassing: o - 8 + j(6),
    vision: o - 7 + j(9),
    control: o - 5 + j(12),
    dribbling: o - 6 + j(15),
    shooting: o - 12 + j(18),
    finishing: o - 14 + j(21),
    shotPower: o - 8 + j(24),
    longShots: o - 12 + j(2),
    defending: o - 10 + j(5),
    strength: o - 4 + j(8),
    stamina: o + 2 + j(11),
    composure: o - 5 + j(14),
  };
  const bump = (key, d) => {
    base[key] = Math.max(28, Math.min(96, base[key] + d));
  };
  if (pos === "GK") {
    bump("pace", -28);
    bump("dribbling", -30);
    bump("shooting", -40);
    bump("finishing", -45);
    bump("defending", -30);
    base.gkDiving = o + j(1);
    base.gkHandling = o - 1 + j(4);
    base.gkPositioning = o + j(7);
    base.gkReflexes = o + 1 + j(10);
    base.gkKicking = o - 6 + j(13);
  } else if (pos === "CB") {
    bump("defending", 10);
    bump("strength", 8);
    bump("pace", -8);
    bump("finishing", -16);
  } else if (pos === "RB" || pos === "LB" || pos === "RWB" || pos === "LWB") {
    bump("pace", 6);
    bump("stamina", 6);
    bump("defending", 4);
  } else if (pos === "DM") {
    bump("defending", 8);
    bump("passing", 4);
    bump("finishing", -10);
  } else if (pos === "CM") {
    bump("passing", 8);
    bump("vision", 6);
    bump("stamina", 4);
  } else if (pos === "AM") {
    bump("vision", 8);
    bump("dribbling", 6);
    bump("shooting", 4);
  } else if (pos === "RM" || pos === "LM") {
    bump("pace", 6);
    bump("passing", 4);
    bump("dribbling", 4);
  } else if (pos === "RW" || pos === "LW") {
    bump("pace", 8);
    bump("dribbling", 8);
    bump("shooting", 4);
    bump("defending", -16);
  } else if (pos === "ST") {
    bump("finishing", 12);
    bump("shooting", 10);
    bump("pace", 4);
    bump("defending", -22);
  }
  for (const k of Object.keys(base)) {
    if (typeof base[k] === "number") base[k] = Math.max(22, Math.min(96, Math.round(base[k])));
  }
  return base;
}

function appearance(seed) {
  const tones = [0.28, 0.36, 0.45, 0.52, 0.62, 0.72];
  const hair = ["short", "fade", "curl", "short", "bald"];
  const hairC = ["#111111", "#1a1410", "#2a2018", "#3b2a18", "#5a4330"];
  const body = ["lean", "standard", "standard", "stocky"];
  return {
    skinTone: tones[seed % tones.length],
    hairStyle: hair[(seed >> 3) % hair.length],
    hairColor: hairC[(seed >> 6) % hairC.length],
    bodyType: body[(seed >> 9) % body.length],
    portraitAsset: null,
  };
}

function makeStadium(id, name, capacity, league = "LEAGUE_ONE") {
  const dense = capacity > 25000 ? 0.96 : capacity > 12000 ? 0.9 : 0.82;
  const deluxe = league === "PREMIER_LEAGUE" || league === "LA_LIGA" || league === "SERIE_A";
  return {
    id,
    name,
    venueType: "PRO_STADIUM",
    pitchLength: 105,
    pitchWidth: 68,
    standConfiguration: deluxe ? "deluxe" : "four",
    crowdCapacity: capacity,
    crowdSections: [
      { id: `${id}_n`, support: "HOME", stand: "north", density: dense },
      { id: `${id}_s`, support: "AWAY", stand: "south", density: Math.max(0.55, dense - 0.18) },
      { id: `${id}_e`, support: "HOME", stand: "east", density: dense - 0.02 },
      { id: `${id}_w`, support: "HOME", stand: "west", density: dense - 0.01 },
    ],
    scoreboard: {
      type: "LED_VIDEO_SCREEN",
      position: deluxe ? [0, 22.5, -58] : [0, 18.6, -54.2],
      rotation: [0.1, 0, 0],
      width: deluxe ? 14.5 : 9.2,
      height: deluxe ? 5.2 : 3.2,
    },
    floodlights: true,
    tunnel: true,
    benches: true,
    advertisingSetId: "home_park_default",
    environment: "urban",
    lightingPreset: "EVENING_FLOODLIGHT",
    crowdDensity: dense,
    audioProfile: deluxe ? "premier_stadium" : "pro_stadium",
  };
}

function gkKit(primary) {
  const options = ["#E8D44D", "#F27A1A", "#3DDC97", "#7B5CFF", "#F4A7C3"];
  const pick = options[hash(primary) % options.length];
  return { shirt: pick, shorts: "#111111", socks: pick, trim: "#111111", numberColor: "#111111" };
}

function buildClub(c) {
  const rows = c.squad.split(";").map(parseRow);
  const numbers = new Set();
  for (const r of rows) {
    if (numbers.has(r.number)) throw new Error(`Duplicate number ${r.number} on ${c.id}`);
    numbers.add(r.number);
  }
  if (rows.length < 11) throw new Error(`${c.id} needs 11 starters`);
  const formation = c.formation;
  const slots = SLOTS[formation];
  if (!slots) throw new Error(`Bad formation ${formation}`);
  const teamId = c.id;
  const stadId = c.stadiumId;
  const team = {
    id: teamId,
    name: c.name,
    abbreviation: c.abbr,
    teamType: "CURRENT_TEAM",
    city: c.city,
    primaryColor: c.primary,
    secondaryColor: c.secondary,
    defaultKit: {
      shirt: c.primary,
      shorts: c.shorts ?? c.secondary,
      socks: c.socks ?? c.primary,
      trim: c.trim ?? c.secondary,
      numberColor: c.numberColor ?? "#FFFFFF",
    },
    goalkeeperKit: gkKit(c.primary),
    defaultStadiumId: stadId,
    defaultFormation: formation,
    league: c.league,
  };
  const stadium = makeStadium(stadId, c.stadium, c.capacity, c.league);
  const players = [];
  const memberships = [];
  const starters = [];
  const tier = TIER[c.league];
  rows.forEach((row, i) => {
    const starter = i < 11;
    const overall = Math.max(50, Math.min(93, tier + (starter ? 3 : -2) + (row.number === 9 || row.number === 10 || row.number === 7 ? 4 : 0) + ((hash(row.name) % 5) - 2)));
    const id = `player_${c.slug}_${slugName(row.name)}_${row.number}`;
    const seed = hash(id);
    players.push({
      id,
      name: row.name,
      displayName: displayName(row.name),
      primaryPosition: row.pos,
      secondaryPositions: [],
      ...attrsFor(row.pos, overall, seed),
      preferredFoot: seed % 7 === 0 ? "L" : "R",
      heightCm: row.pos === "GK" ? 188 + (seed % 8) : 176 + (seed % 14),
      appearance: appearance(seed),
    });
    memberships.push({
      playerId: id,
      teamId,
      shirtNumber: row.number,
      squadRole: starter ? "FIRST_TEAM" : "BENCH",
      captain: row.captain || undefined,
      from: "2026-07-01",
      to: null,
    });
    if (starter) starters.push({ playerId: id, slot: slots[i] });
  });
  const lineup = { id: `${c.slug}_xi`, teamId, formation, starters };
  return { team, stadium, players, memberships, lineup };
}

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
}

function saveJson(name, value) {
  fs.writeFileSync(path.join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  if (ALL_CLUBS.length < 106) throw new Error(`Expected 107 generated clubs, got ${ALL_CLUBS.length}`);
  const built = ALL_CLUBS.map(buildClub);
  const teams = loadJson("teams.json");
  const players = loadJson("players.json");
  const memberships = loadJson("teamMemberships.json");
  const lineups = loadJson("lineups.json");
  const stadiums = loadJson("stadiums.json");

  const argyle = teams.find((t) => t.id === "plymouth_argyle_current");
  if (argyle) argyle.league = "LEAGUE_ONE";
  const barnsley = teams.find((t) => t.id === "barnsley_current");
  if (barnsley) barnsley.league = "LEAGUE_ONE";

  const existingTeamIds = new Set(teams.map((t) => t.id));
  const existingPlayerIds = new Set(players.map((p) => p.id));
  const existingStadIds = new Set(stadiums.map((s) => s.id));
  const existingLineupTeams = new Set(lineups.map((l) => l.teamId));

  for (const b of built) {
    if (!existingTeamIds.has(b.team.id)) {
      teams.push(b.team);
      existingTeamIds.add(b.team.id);
    } else {
      const t = teams.find((x) => x.id === b.team.id);
      t.league = b.team.league;
    }
    if (!existingStadIds.has(b.stadium.id)) {
      stadiums.push(b.stadium);
      existingStadIds.add(b.stadium.id);
    }
    for (const p of b.players) {
      if (!existingPlayerIds.has(p.id)) {
        players.push(p);
        existingPlayerIds.add(p.id);
      }
    }
    const nextMem = memberships.filter((m) => m.teamId !== b.team.id);
    memberships.length = 0;
    memberships.push(...nextMem, ...b.memberships);
    const li = lineups.findIndex((l) => l.teamId === b.team.id);
    if (li >= 0) lineups[li] = b.lineup;
    else if (!existingLineupTeams.has(b.team.id)) lineups.push(b.lineup);
  }

  saveJson("teams.json", teams);
  saveJson("players.json", players);
  saveJson("teamMemberships.json", memberships);
  saveJson("lineups.json", lineups);
  saveJson("stadiums.json", stadiums);
  console.log(`Wrote ${built.length} generated clubs. Teams now ${teams.length}, players ${players.length}.`);
}

main();
