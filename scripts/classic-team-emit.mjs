#!/usr/bin/env node
export const RATINGS_NOTE =
  "Historic gameplay ratings independently authored for this simulation; season/tournament-specific and not copied from commercial football videogame ratings.";
export const DATA_VERSION = "2.0";
export const STADIUM_ID = "home_park";

const V1_KEYS = [
  "pace", "acceleration", "agility", "balance",
  "control", "dribbling",
  "passing", "longPassing", "vision", "crossing",
  "shooting", "finishing", "shotPower", "longShots",
  "heading", "penalties", "setPieces",
  "defending", "defensiveAwareness", "tackling", "aggression",
  "strength", "stamina", "composure", "attackingAwareness", "reactions", "jumping",
];

const GK_KEYS = ["gkDiving", "gkHandling", "gkPositioning", "gkReflexes", "gkKicking"];

/** Emitted line groups, purely for readability of the generated files. */
const KEY_GROUPS = [
  ["pace", "acceleration", "agility", "balance"],
  ["control", "dribbling"],
  ["passing", "longPassing", "vision", "crossing"],
  ["shooting", "finishing", "shotPower", "longShots"],
  ["heading", "penalties", "setPieces"],
  ["defending", "defensiveAwareness", "tackling", "aggression"],
  ["strength", "stamina", "composure", "attackingAwareness", "reactions", "jumping"],
];

const FORMATION_SLOTS = {
  "4-2-3-1": ["GK", "RB", "RCB", "LCB", "LB", "RDM", "LDM", "RAM", "CAM", "LAM", "ST"],
  "4-3-3": ["GK", "RB", "RCB", "LCB", "LB", "RCM", "CM", "LCM", "RW", "ST", "LW"],
  "4-4-2": ["GK", "RB", "RCB", "LCB", "LB", "RM", "RCM", "LCM", "LM", "RST", "LST"],
  "3-4-2-1": ["GK", "RCB", "CB", "LCB", "RM", "RCM", "LCM", "LM", "RAM", "LAM", "ST"],
};

const POSITIONS = new Set(["GK", "RB", "CB", "LB", "RWB", "LWB", "DM", "CM", "AM", "RM", "LM", "RW", "LW", "ST"]);

/** Offsets applied to a player's overall rating, per positional archetype. */
const ARCH = {
  GK: {
    pace: -26, acceleration: -26, agility: -12, balance: -8,
    control: -24, dribbling: -34,
    passing: -24, longPassing: -18, vision: -22, crossing: -40,
    shooting: -44, finishing: -46, shotPower: -24, longShots: -40,
    heading: -30, penalties: -34, setPieces: -34,
    defending: -34, defensiveAwareness: -18, tackling: -40, aggression: -24,
    strength: -4, stamina: -16, composure: -2, attackingAwareness: -40, reactions: 1, jumping: -2,
  },
  FB: {
    pace: 3, acceleration: 3, agility: 1, balance: 0,
    control: -3, dribbling: -4,
    passing: -3, longPassing: -6, vision: -7, crossing: 1,
    shooting: -18, finishing: -21, shotPower: -10, longShots: -14,
    heading: -6, penalties: -20, setPieces: -14,
    defending: 1, defensiveAwareness: 0, tackling: 1, aggression: 1,
    strength: -4, stamina: 3, composure: -3, attackingAwareness: -8, reactions: -1, jumping: -4,
  },
  CB: {
    pace: -9, acceleration: -10, agility: -13, balance: -2,
    control: -8, dribbling: -17,
    passing: -7, longPassing: -8, vision: -10, crossing: -22,
    shooting: -24, finishing: -28, shotPower: -6, longShots: -22,
    heading: 3, penalties: -22, setPieces: -20,
    defending: 3, defensiveAwareness: 3, tackling: 2, aggression: 3,
    strength: 4, stamina: -2, composure: 0, attackingAwareness: -20, reactions: -1, jumping: 3,
  },
  DM: {
    pace: -6, acceleration: -6, agility: -6, balance: -1,
    control: -2, dribbling: -7,
    passing: -1, longPassing: -3, vision: -3, crossing: -12,
    shooting: -14, finishing: -18, shotPower: -6, longShots: -10,
    heading: -6, penalties: -16, setPieces: -12,
    defending: 2, defensiveAwareness: 2, tackling: 2, aggression: 3,
    strength: 0, stamina: 3, composure: -1, attackingAwareness: -12, reactions: 0, jumping: -4,
  },
  CM: {
    pace: -5, acceleration: -5, agility: -3, balance: -1,
    control: 1, dribbling: -2,
    passing: 2, longPassing: 1, vision: 2, crossing: -6,
    shooting: -8, finishing: -11, shotPower: -5, longShots: -5,
    heading: -10, penalties: -10, setPieces: -6,
    defending: -6, defensiveAwareness: -5, tackling: -6, aggression: -3,
    strength: -6, stamina: 2, composure: 0, attackingAwareness: -5, reactions: 0, jumping: -8,
  },
  AM: {
    pace: -3, acceleration: -2, agility: 2, balance: 1,
    control: 3, dribbling: 3,
    passing: 2, longPassing: 0, vision: 3, crossing: -3,
    shooting: -2, finishing: -4, shotPower: -4, longShots: 0,
    heading: -14, penalties: -4, setPieces: -2,
    defending: -20, defensiveAwareness: -18, tackling: -22, aggression: -12,
    strength: -12, stamina: -3, composure: 1, attackingAwareness: 1, reactions: 0, jumping: -12,
  },
  WM: {
    pace: 2, acceleration: 2, agility: 2, balance: 0,
    control: 0, dribbling: 2,
    passing: -3, longPassing: -6, vision: -4, crossing: 3,
    shooting: -8, finishing: -9, shotPower: -6, longShots: -5,
    heading: -14, penalties: -10, setPieces: -6,
    defending: -12, defensiveAwareness: -12, tackling: -12, aggression: -6,
    strength: -10, stamina: 3, composure: -2, attackingAwareness: -2, reactions: -1, jumping: -10,
  },
  W: {
    pace: 5, acceleration: 5, agility: 4, balance: 1,
    control: 2, dribbling: 5,
    passing: -5, longPassing: -10, vision: -4, crossing: 0,
    shooting: -2, finishing: -3, shotPower: -5, longShots: -4,
    heading: -15, penalties: -8, setPieces: -8,
    defending: -26, defensiveAwareness: -24, tackling: -28, aggression: -12,
    strength: -12, stamina: -1, composure: -1, attackingAwareness: 2, reactions: 0, jumping: -10,
  },
  ST: {
    pace: 1, acceleration: 1, agility: 0, balance: 0,
    control: 0, dribbling: -2,
    passing: -8, longPassing: -14, vision: -7, crossing: -14,
    shooting: 3, finishing: 4, shotPower: 1, longShots: -4,
    heading: -2, penalties: -2, setPieces: -12,
    defending: -30, defensiveAwareness: -28, tackling: -32, aggression: -6,
    strength: -2, stamina: -3, composure: 1, attackingAwareness: 3, reactions: 1, jumping: -2,
  },
};

const GK_ARCH = { gkDiving: 0, gkHandling: -2, gkPositioning: -1, gkReflexes: 1, gkKicking: -6 };

const clamp = (n) => Math.max(1, Math.min(100, Math.round(n)));

function ratingsFor(player) {
  const arch = ARCH[player.arch];
  if (!arch) throw new Error(`Unknown archetype ${player.arch} for ${player.name}`);
  const overrides = player.r ?? {};
  for (const key of Object.keys(overrides)) {
    if (!V1_KEYS.includes(key)) throw new Error(`Unknown override "${key}" on ${player.name}`);
  }
  const out = {};
  for (const key of V1_KEYS) out[key] = clamp(overrides[key] ?? player.o + arch[key]);
  return out;
}

function gkRatingsFor(player) {
  const overrides = player.gk ?? {};
  for (const key of Object.keys(overrides)) {
    if (!GK_KEYS.includes(key)) throw new Error(`Unknown GK override "${key}" on ${player.name}`);
  }
  const out = {};
  for (const key of GK_KEYS) out[key] = clamp(overrides[key] ?? player.o + GK_ARCH[key]);
  return out;
}

function shortNameOf(player) {
  if (player.short) return player.short;
  const parts = player.name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
}

function buildTeam(team) {
  const slots = FORMATION_SLOTS[team.formation];
  if (!slots) throw new Error(`${team.teamId}: unsupported formation ${team.formation}`);

  const players = [];
  const xi = [];
  const bench = [];
  const seenIds = new Set();
  const seenNumbers = new Set();
  const seenSlots = new Set();
  let goalkeepers = 0;

  for (const player of team.squad) {
    const id = `${team.playerPrefix}_${player.key}`;
    if (seenIds.has(id)) throw new Error(`${team.teamId}: duplicate player id ${id}`);
    seenIds.add(id);
    if (seenNumbers.has(player.num)) throw new Error(`${team.teamId}: duplicate shirt number ${player.num}`);
    seenNumbers.add(player.num);
    if (!POSITIONS.has(player.pos)) throw new Error(`${team.teamId}: bad position ${player.pos} for ${player.name}`);
    for (const pos of player.sec ?? []) {
      if (!POSITIONS.has(pos)) throw new Error(`${team.teamId}: bad secondary position ${pos} for ${player.name}`);
    }
    if (player.pos === "GK") goalkeepers += 1;

    players.push({
      id,
      name: player.name,
      displayName: shortNameOf(player),
      primaryPosition: player.pos,
      secondaryPositions: player.sec,
      preferredFoot: player.foot,
      heightCm: player.h,
      weightKg: player.w,
      ratings: ratingsFor(player),
      gk: player.pos === "GK" ? gkRatingsFor(player) : undefined,
    });

    if (player.slot) {
      if (!slots.includes(player.slot)) {
        throw new Error(`${team.teamId}: slot ${player.slot} is not part of ${team.formation}`);
      }
      if (seenSlots.has(player.slot)) throw new Error(`${team.teamId}: duplicate slot ${player.slot}`);
      seenSlots.add(player.slot);
      xi.push({ id, shirtNumber: player.num, slot: player.slot, captain: player.captain === true });
    } else {
      bench.push({ id, shirtNumber: player.num });
    }
  }

  const missingSlots = slots.filter((slot) => !seenSlots.has(slot));
  if (missingSlots.length) throw new Error(`${team.teamId}: unfilled slots ${missingSlots.join(", ")}`);
  if (bench.length < 9) throw new Error(`${team.teamId}: only ${bench.length} bench players`);
  if (players.length < 20) throw new Error(`${team.teamId}: only ${players.length} players`);
  if (goalkeepers < 2) throw new Error(`${team.teamId}: only ${goalkeepers} goalkeepers`);
  if (xi.filter((row) => row.captain).length !== 1) throw new Error(`${team.teamId}: needs exactly one captain`);

  // Keep the emitted XI in formation order so the lineup reads top-down.
  xi.sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));

  return { players, xi, bench, goalkeepers };
}

function emitPlayer(player) {
  const lines = [];
  lines.push("    {");
  lines.push(`      id: ${JSON.stringify(player.id)},`);
  lines.push(`      name: ${JSON.stringify(player.name)},`);
  lines.push(`      displayName: ${JSON.stringify(player.displayName)},`);
  lines.push(`      primaryPosition: ${JSON.stringify(player.primaryPosition)},`);
  if (player.secondaryPositions?.length) {
    lines.push(`      secondaryPositions: [${player.secondaryPositions.map((p) => JSON.stringify(p)).join(", ")}],`);
  }
  lines.push(`      preferredFoot: ${JSON.stringify(player.preferredFoot)},`);
  lines.push(`      heightCm: ${player.heightCm},`);
  lines.push(`      weightKg: ${player.weightKg},`);
  for (const group of KEY_GROUPS) {
    lines.push(`      ${group.map((key) => `${key}: ${player.ratings[key]}`).join(", ")},`);
  }
  if (player.gk) {
    lines.push(`      gk: { ${GK_KEYS.map((key) => `${key}: ${player.gk[key]}`).join(", ")} },`);
  }
  lines.push("    },");
  return lines.join("\n");
}

function emitTeamFile(team, built) {
  const lines = [];
  lines.push(`import type { ClassicTeamDefinition } from "../types";`);
  lines.push("");
  lines.push(`export const ${team.constName}: ClassicTeamDefinition = {`);
  lines.push(`  teamId: ${JSON.stringify(team.teamId)},`);
  lines.push(`  lineupId: ${JSON.stringify(`${team.teamId}_xi`)},`);
  lines.push(`  playerPrefix: ${JSON.stringify(team.playerPrefix)},`);
  lines.push(`  displayName: ${JSON.stringify(team.displayName)},`);
  lines.push(`  abbreviation: ${JSON.stringify(team.abbreviation)},`);
  lines.push(`  eraLabel: ${JSON.stringify(team.eraLabel)},`);
  lines.push(`  season: ${JSON.stringify(team.season)},`);
  lines.push(`  manager: ${JSON.stringify(team.manager)},`);
  lines.push(`  formation: ${JSON.stringify(team.formation)},`);
  const dataVersion = team.dataVersion ?? DATA_VERSION;
  const ratingsNote = team.ratingsNote ?? RATINGS_NOTE;
  lines.push(`  dataVersion: ${JSON.stringify(dataVersion)},`);
  lines.push(`  ratingsNote:`);
  lines.push(`    ${JSON.stringify(ratingsNote)},`);
  if (team.teamCategory) lines.push(`  teamCategory: ${JSON.stringify(team.teamCategory)},`);
  if (team.tournament) lines.push(`  tournament: ${JSON.stringify(team.tournament)},`);
  lines.push(`  primaryColor: ${JSON.stringify(team.primaryColor)},`);
  lines.push(`  secondaryColor: ${JSON.stringify(team.secondaryColor)},`);
  lines.push(`  kitShirt: ${JSON.stringify(team.kitShirt)},`);
  lines.push(`  kitShorts: ${JSON.stringify(team.kitShorts)},`);
  lines.push(`  kitSocks: ${JSON.stringify(team.kitSocks)},`);
  lines.push(`  stadiumId: ${JSON.stringify(STADIUM_ID)},`);
  lines.push("  players: [");
  for (const player of built.players) lines.push(emitPlayer(player));
  lines.push("  ],");
  lines.push("  xi: [");
  for (const row of built.xi) {
    const captain = row.captain ? ", captain: true" : "";
    lines.push(`    { id: ${JSON.stringify(row.id)}, shirtNumber: ${row.shirtNumber}, slot: ${JSON.stringify(row.slot)}${captain} },`);
  }
  lines.push("  ],");
  lines.push("  bench: [");
  for (const row of built.bench) {
    lines.push(`    { id: ${JSON.stringify(row.id)}, shirtNumber: ${row.shirtNumber} },`);
  }
  lines.push("  ],");
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

function emitIndexFile(teams) {
  const lines = [];
  lines.push(`import type { ClassicTeamDefinition } from "./types";`);
  for (const team of teams) {
    lines.push(`import { ${team.constName} } from "./teams/${team.fileName}";`);
  }
  lines.push("");
  lines.push(`export * from "./types";`);
  for (const team of teams) {
    lines.push(`export { ${team.constName} } from "./teams/${team.fileName}";`);
  }
  lines.push("");
  lines.push("export const CLASSIC_TEAM_DEFINITIONS: ClassicTeamDefinition[] = [");
  for (const team of teams) lines.push(`  ${team.constName},`);
  lines.push("];");
  lines.push("");
  lines.push("export function getClassicTeamDefinitions(): ClassicTeamDefinition[] {");
  lines.push("  return CLASSIC_TEAM_DEFINITIONS;");
  lines.push("}");
  lines.push("");
  lines.push("export function getClassicTeamDefinition(teamId: string): ClassicTeamDefinition | undefined {");
  lines.push("  return CLASSIC_TEAM_DEFINITIONS.find((team) => team.teamId === teamId);");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}


export { V1_KEYS, GK_KEYS, KEY_GROUPS, FORMATION_SLOTS, POSITIONS, ARCH, GK_ARCH, clamp, ratingsFor, gkRatingsFor, shortNameOf, buildTeam, emitPlayer, emitTeamFile, emitIndexFile };
