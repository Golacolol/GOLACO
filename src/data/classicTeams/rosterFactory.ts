import type { FormationName } from "../../football/teams/Formation";
import type { PositionCode } from "../schema";
import type {
  ClassicGkRatings,
  ClassicOutfieldRatings,
  ClassicPlayerInput,
  ClassicTeamDefinition,
} from "./types";

/** Compact role used to expand authored overall bands into full V1 ratings. */
export type ClassicRole = "GK" | "CB" | "FB" | "DM" | "CM" | "AM" | "WM" | "W" | "ST";

export interface CompactPlayer {
  /** Unique key within the team (becomes id suffix). */
  k: string;
  n: string;
  d?: string;
  p: PositionCode;
  r: ClassicRole;
  /** Peak era overall band (roughly 62–94). */
  o: number;
  f?: "L" | "R";
  h?: number;
  w?: number;
}

export interface CompactStarter {
  k: string;
  no: number;
  slot: string;
  c?: boolean;
}

export interface CompactBench {
  k: string;
  no: number;
}

export interface CompactTeam {
  teamId: string;
  lineupId?: string;
  playerPrefix: string;
  displayName: string;
  abbreviation: string;
  season: string;
  manager: string;
  formation: FormationName;
  primaryColor: string;
  secondaryColor: string;
  kitShirt: string;
  kitShorts: string;
  kitSocks: string;
  stadiumId: string;
  teamCategory?: "CLUB" | "INTERNATIONAL";
  tournament?: string;
  awayKitShirt?: string;
  awayKitShorts?: string;
  awayKitSocks?: string;
  squad: CompactPlayer[];
  xi: CompactStarter[];
  bench: CompactBench[];
}

function clamp(n: number, lo = 1, hi = 99): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function jitter(base: number, seed: number, salt: number, spread = 3): number {
  const j = ((seed + salt * 17) % (spread * 2 + 1)) - spread;
  return clamp(base + j);
}

/** Shirt surname from a full name — repairs split apostrophes (Guivarc h → Guivarc'h). */
export function classicKitName(fullName: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fullName;
  if (parts.length >= 2 && parts[parts.length - 1].length === 1 && parts[parts.length - 2].length > 1) {
    return `${parts[parts.length - 2]}'${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1]!;
}

type Bias = Partial<Record<keyof ClassicOutfieldRatings, number>>;

const ROLE_BIAS: Record<ClassicRole, Bias> = {
  GK: {
    pace: -18, acceleration: -16, agility: -4, balance: 2,
    control: -12, dribbling: -22,
    passing: -10, longPassing: -6, vision: -8, crossing: -24,
    shooting: -28, finishing: -30, shotPower: -12, longShots: -26,
    heading: -16, penalties: -12, setPieces: -10,
    defending: -14, defensiveAwareness: -4, tackling: -20, aggression: -8,
    strength: 4, stamina: -8, composure: 6, attackingAwareness: -24, reactions: 8, jumping: 4,
  },
  CB: {
    pace: -6, acceleration: -6, agility: -4, balance: 4,
    control: -2, dribbling: -10,
    passing: 0, longPassing: 2, vision: -2, crossing: -12,
    shooting: -14, finishing: -16, shotPower: -4, longShots: -12,
    heading: 10, penalties: -8, setPieces: -6,
    defending: 12, defensiveAwareness: 12, tackling: 11, aggression: 8,
    strength: 10, stamina: 2, composure: 4, attackingAwareness: -10, reactions: 4, jumping: 10,
  },
  FB: {
    pace: 6, acceleration: 6, agility: 4, balance: 2,
    control: 0, dribbling: 2,
    passing: 0, longPassing: -2, vision: -2, crossing: 8,
    shooting: -10, finishing: -12, shotPower: -4, longShots: -8,
    heading: 0, penalties: -8, setPieces: -2,
    defending: 6, defensiveAwareness: 4, tackling: 6, aggression: 4,
    strength: 0, stamina: 8, composure: 0, attackingAwareness: 0, reactions: 2, jumping: 2,
  },
  DM: {
    pace: -2, acceleration: -2, agility: 0, balance: 2,
    control: 2, dribbling: -2,
    passing: 4, longPassing: 4, vision: 2, crossing: -6,
    shooting: -8, finishing: -10, shotPower: -2, longShots: -4,
    heading: 2, penalties: -4, setPieces: 0,
    defending: 8, defensiveAwareness: 8, tackling: 8, aggression: 6,
    strength: 4, stamina: 6, composure: 2, attackingAwareness: -4, reactions: 2, jumping: 2,
  },
  CM: {
    pace: 0, acceleration: 0, agility: 2, balance: 2,
    control: 4, dribbling: 2,
    passing: 6, longPassing: 4, vision: 4, crossing: 0,
    shooting: 0, finishing: -2, shotPower: 0, longShots: 2,
    heading: 0, penalties: 0, setPieces: 2,
    defending: 0, defensiveAwareness: 0, tackling: 0, aggression: 0,
    strength: 0, stamina: 4, composure: 2, attackingAwareness: 2, reactions: 2, jumping: 0,
  },
  AM: {
    pace: 2, acceleration: 2, agility: 4, balance: 2,
    control: 6, dribbling: 6,
    passing: 6, longPassing: 2, vision: 8, crossing: 2,
    shooting: 4, finishing: 4, shotPower: 2, longShots: 4,
    heading: -4, penalties: 2, setPieces: 4,
    defending: -10, defensiveAwareness: -10, tackling: -10, aggression: -4,
    strength: -4, stamina: 2, composure: 4, attackingAwareness: 8, reactions: 4, jumping: -2,
  },
  WM: {
    pace: 6, acceleration: 6, agility: 4, balance: 2,
    control: 2, dribbling: 4,
    passing: 2, longPassing: 0, vision: 2, crossing: 8,
    shooting: 0, finishing: 0, shotPower: 0, longShots: 0,
    heading: -2, penalties: 0, setPieces: 2,
    defending: -4, defensiveAwareness: -4, tackling: -4, aggression: 0,
    strength: -2, stamina: 6, composure: 0, attackingAwareness: 4, reactions: 2, jumping: 0,
  },
  W: {
    pace: 10, acceleration: 10, agility: 8, balance: 2,
    control: 4, dribbling: 8,
    passing: 0, longPassing: -2, vision: 2, crossing: 6,
    shooting: 2, finishing: 4, shotPower: 0, longShots: 2,
    heading: -6, penalties: 0, setPieces: 0,
    defending: -14, defensiveAwareness: -14, tackling: -14, aggression: -4,
    strength: -6, stamina: 4, composure: 2, attackingAwareness: 8, reactions: 4, jumping: -4,
  },
  ST: {
    pace: 4, acceleration: 4, agility: 2, balance: 2,
    control: 2, dribbling: 2,
    passing: -2, longPassing: -6, vision: 0, crossing: -8,
    shooting: 10, finishing: 12, shotPower: 8, longShots: 4,
    heading: 6, penalties: 6, setPieces: 0,
    defending: -16, defensiveAwareness: -16, tackling: -16, aggression: 2,
    strength: 4, stamina: 2, composure: 4, attackingAwareness: 10, reactions: 4, jumping: 6,
  },
};

const KEYS: (keyof ClassicOutfieldRatings)[] = [
  "pace", "acceleration", "agility", "balance", "control", "dribbling",
  "passing", "longPassing", "vision", "crossing",
  "shooting", "finishing", "shotPower", "longShots", "heading", "penalties", "setPieces",
  "defending", "defensiveAwareness", "tackling", "aggression",
  "strength", "stamina", "composure", "attackingAwareness", "reactions", "jumping",
];

export function expandCompactPlayer(prefix: string, p: CompactPlayer): ClassicPlayerInput {
  const id = `${prefix}_${p.k}`;
  const seed = hashSeed(id);
  const ovr = clamp(p.o, 55, 96);
  const bias = ROLE_BIAS[p.r];
  const ratings = {} as ClassicOutfieldRatings;
  KEYS.forEach((key, i) => {
    ratings[key] = jitter(ovr + (bias[key] ?? 0), seed, i + 1);
  });

  const heightCm = p.h ?? (p.r === "GK" ? 190 : p.r === "CB" ? 186 : p.r === "ST" ? 182 : 178);
  const weightKg = p.w ?? Math.round(heightCm * 0.42 - (p.r === "W" ? 6 : 0));
  const out: ClassicPlayerInput = {
    id,
    name: p.n,
    displayName: classicKitName(p.n, p.d),
    primaryPosition: p.p,
    preferredFoot: p.f ?? (p.p === "LB" || p.p === "LM" || p.p === "LW" || p.p === "LWB" ? "L" : "R"),
    heightCm,
    weightKg,
    ...ratings,
  };

  if (p.p === "GK" || p.r === "GK") {
    const gk: ClassicGkRatings = {
      gkDiving: jitter(ovr + 2, seed, 101),
      gkHandling: jitter(ovr + 1, seed, 102),
      gkPositioning: jitter(ovr + 3, seed, 103),
      gkReflexes: jitter(ovr + 2, seed, 104),
      gkKicking: jitter(ovr - 6, seed, 105),
    };
    out.gk = gk;
  }
  return out;
}

export function buildFromCompact(team: CompactTeam): ClassicTeamDefinition {
  const players = team.squad.map((p) => expandCompactPlayer(team.playerPrefix, p));
  const byKey = new Map(team.squad.map((p) => [p.k, p]));
  for (const row of team.xi) {
    if (!byKey.has(row.k)) throw new Error(`${team.teamId}: XI key missing from squad: ${row.k}`);
  }
  for (const row of team.bench) {
    if (!byKey.has(row.k)) throw new Error(`${team.teamId}: bench key missing from squad: ${row.k}`);
  }
  return {
    teamId: team.teamId,
    lineupId: team.lineupId ?? `${team.teamId}_xi`,
    playerPrefix: team.playerPrefix,
    displayName: team.displayName,
    abbreviation: team.abbreviation,
    eraLabel: team.displayName,
    season: team.season,
    manager: team.manager,
    formation: team.formation,
    dataVersion: "4.0",
    ratingsNote:
      "Historic gameplay ratings independently authored for this simulation; season/tournament-specific and not copied from commercial football videogame ratings.",
    primaryColor: team.primaryColor,
    secondaryColor: team.secondaryColor,
    kitShirt: team.kitShirt,
    kitShorts: team.kitShorts,
    kitSocks: team.kitSocks,
    awayKitShirt: team.awayKitShirt,
    awayKitShorts: team.awayKitShorts,
    awayKitSocks: team.awayKitSocks,
    stadiumId: team.stadiumId,
    teamCategory: team.teamCategory,
    tournament: team.tournament,
    players,
    xi: team.xi.map((row) => ({
      id: `${team.playerPrefix}_${row.k}`,
      shirtNumber: row.no,
      slot: row.slot,
      captain: row.c,
    })),
    bench: team.bench.map((row) => ({
      id: `${team.playerPrefix}_${row.k}`,
      shirtNumber: row.no,
    })),
  };
}
