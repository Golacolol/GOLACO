import type { FormationName } from "../../football/teams/Formation";
import type { LineupRecord, PlayerRecord, PositionCode, TeamMembership, TeamRecord } from "../schema";

/** All outfield V1 capability ratings — must be explicitly authored for Classic Teams. */
export interface ClassicOutfieldRatings {
  pace: number;
  acceleration: number;
  agility: number;
  balance: number;
  control: number;
  dribbling: number;
  passing: number;
  longPassing: number;
  vision: number;
  crossing: number;
  shooting: number;
  finishing: number;
  shotPower: number;
  longShots: number;
  heading: number;
  penalties: number;
  setPieces: number;
  defending: number;
  defensiveAwareness: number;
  tackling: number;
  aggression: number;
  strength: number;
  stamina: number;
  composure: number;
  attackingAwareness: number;
  reactions: number;
  jumping: number;
}

export interface ClassicGkRatings {
  gkDiving: number;
  gkHandling: number;
  gkPositioning: number;
  gkReflexes: number;
  gkKicking: number;
}

export interface ClassicPlayerInput extends ClassicOutfieldRatings {
  id: string;
  name: string;
  displayName: string;
  primaryPosition: PositionCode;
  secondaryPositions?: PositionCode[];
  preferredFoot: "L" | "R";
  heightCm: number;
  weightKg: number;
  gk?: ClassicGkRatings;
}

export interface ClassicStarter {
  id: string;
  shirtNumber: number;
  slot: string;
  captain?: boolean;
}

export interface ClassicBench {
  id: string;
  shirtNumber: number;
}

export interface ClassicTeamDefinition {
  teamId: string;
  lineupId: string;
  playerPrefix: string;
  displayName: string;
  abbreviation: string;
  eraLabel: string;
  season: string;
  manager: string;
  formation: FormationName;
  dataVersion: string;
  ratingsNote: string;
  primaryColor: string;
  secondaryColor: string;
  kitShirt: string;
  kitShorts: string;
  kitSocks: string;
  /** Optional authored away kit; otherwise derived from secondaryColor. */
  awayKitShirt?: string;
  awayKitShorts?: string;
  awayKitSocks?: string;
  awayKitNumberColor?: string;
  stadiumId: string;
  /** Clubs are the default; national sides load as INTERNATIONAL teams. */
  teamCategory?: "CLUB" | "INTERNATIONAL";
  /** Competition the squad is modelled on, e.g. "1986 FIFA World Cup". */
  tournament?: string;
  players: ClassicPlayerInput[];
  xi: ClassicStarter[];
  bench: ClassicBench[];
}

export const CLASSIC_V1_KEYS: (keyof ClassicOutfieldRatings)[] = [
  "pace", "acceleration", "agility", "balance", "control", "dribbling",
  "passing", "longPassing", "vision", "crossing",
  "shooting", "finishing", "shotPower", "longShots", "heading", "penalties", "setPieces",
  "defending", "defensiveAwareness", "tackling", "aggression",
  "strength", "stamina", "composure", "attackingAwareness", "reactions", "jumping",
];

export const CLASSIC_GK_KEYS: (keyof ClassicGkRatings)[] = [
  "gkDiving", "gkHandling", "gkPositioning", "gkReflexes", "gkKicking",
];

export function buildClassicPlayer(input: ClassicPlayerInput): PlayerRecord {
  const record: PlayerRecord = {
    id: input.id,
    name: input.name,
    displayName: input.displayName,
    primaryPosition: input.primaryPosition,
    secondaryPositions: input.secondaryPositions ?? [],
    preferredFoot: input.preferredFoot,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    pace: input.pace,
    acceleration: input.acceleration,
    agility: input.agility,
    balance: input.balance,
    control: input.control,
    dribbling: input.dribbling,
    passing: input.passing,
    longPassing: input.longPassing,
    vision: input.vision,
    crossing: input.crossing,
    shooting: input.shooting,
    finishing: input.finishing,
    shotPower: input.shotPower,
    longShots: input.longShots,
    heading: input.heading,
    penalties: input.penalties,
    setPieces: input.setPieces,
    defending: input.defending,
    defensiveAwareness: input.defensiveAwareness,
    tackling: input.tackling,
    aggression: input.aggression,
    strength: input.strength,
    stamina: input.stamina,
    composure: input.composure,
    attackingAwareness: input.attackingAwareness,
    reactions: input.reactions,
    jumping: input.jumping,
    appearance: {
      skinTone: 0.5,
      hairStyle: "short",
      hairColor: "#1a1410",
      bodyType: input.heightCm >= 188 ? "stocky" : input.heightCm <= 175 ? "lean" : "standard",
      heightScale: input.heightCm >= 190 ? 1.05 : input.heightCm <= 172 ? 0.96 : 1,
      portraitAsset: null,
    },
  };
  if (input.gk) {
    record.gkDiving = input.gk.gkDiving;
    record.gkHandling = input.gk.gkHandling;
    record.gkPositioning = input.gk.gkPositioning;
    record.gkReflexes = input.gk.gkReflexes;
    record.gkKicking = input.gk.gkKicking;
  }
  return record;
}

export function buildClassicTeamArtifacts(def: ClassicTeamDefinition): {
  team: TeamRecord;
  players: PlayerRecord[];
  memberships: TeamMembership[];
  lineup: LineupRecord;
} {
  const from = `${def.season.slice(0, 4)}-07-01`;
  const players = def.players.map(buildClassicPlayer);
  const memberships: TeamMembership[] = [
    ...def.xi.map((row) => ({
      playerId: row.id,
      teamId: def.teamId,
      shirtNumber: row.shirtNumber,
      squadRole: "LEGEND" as const,
      captain: row.captain,
      from,
      to: null,
    })),
    ...def.bench.map((row) => ({
      playerId: row.id,
      teamId: def.teamId,
      shirtNumber: row.shirtNumber,
      squadRole: "LEGEND" as const,
      from,
      to: null,
    })),
  ];
  const lineup: LineupRecord = {
    id: def.lineupId,
    teamId: def.teamId,
    formation: def.formation,
    starters: def.xi.map((row) => ({ playerId: row.id, slot: row.slot })),
  };
  const team: TeamRecord = {
    id: def.teamId,
    name: def.displayName,
    abbreviation: def.abbreviation,
    teamType: def.teamCategory === "INTERNATIONAL" ? "INTERNATIONAL" : "HISTORIC_TEAM",
    primaryColor: def.primaryColor,
    secondaryColor: def.secondaryColor,
    defaultKit: {
      shirt: def.kitShirt,
      shorts: def.kitShorts,
      socks: def.kitSocks,
    },
    awayKit: def.awayKitShirt
      ? {
          shirt: def.awayKitShirt,
          shorts: def.awayKitShorts ?? "#ffffff",
          socks: def.awayKitSocks ?? def.awayKitShirt,
          numberColor: def.awayKitNumberColor,
        }
      : {
          shirt: def.secondaryColor,
          shorts: def.kitShorts === def.secondaryColor ? "#111111" : def.kitShorts,
          socks: def.secondaryColor,
          trim: def.kitShirt,
          numberColor: "#111111",
        },
    goalkeeperKit: {
      shirt: "#111111",
      shorts: "#111111",
      socks: "#111111",
      numberColor: "#ffffff",
    },
    defaultStadiumId: def.stadiumId,
    defaultFormation: def.formation,
    historicSeason: def.season,
  };
  return { team, players, memberships, lineup };
}
