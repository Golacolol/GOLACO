/**
 * Team play-style — derived from strength / league tier, or Formation override.
 * Scales risk and tempo; position jobs stay in PositionArchetype.
 */
import type { EnglishLeague, TeamRecord } from "../../data/schema";
import type { Player } from "../players/Player";
import { clamp } from "../../core/math";

export type PlayStyleId = "possession" | "balanced" | "counter" | "direct" | "routeOne";

export type PlayStyleChoice = PlayStyleId | "auto";

export interface PlayStyleProfile {
  id: PlayStyleId;
  /** Prefer short recirculation (0–1). */
  shortBias: number;
  /** Prefer progressive / through / over-the-top (0–1). */
  progressiveBias: number;
  /** Willingness to go long under low pressure (0–1). */
  longBias: number;
  /** ST stretch / early FORWARD_RUN (0–1). */
  stretchBias: number;
  /** Defensive stand-off vs hunt (higher = more contain). */
  standOffBias: number;
  /** Tempo: how quickly to force a pass (1 = normal). */
  tempo: number;
  /** Extra progressive/through weight in transition phase (0–1). */
  transitionBurst: number;
  /** First-touch patience before second action (0–1). */
  receivePatience: number;
}

const PROFILES: Record<PlayStyleId, Omit<PlayStyleProfile, "id">> = {
  possession: {
    shortBias: 0.62,
    progressiveBias: 0.48,
    longBias: 0.32,
    stretchBias: 0.52,
    standOffBias: 0.62,
    tempo: 0.82,
    transitionBurst: 0.32,
    receivePatience: 0.82,
  },
  balanced: {
    shortBias: 0.42,
    progressiveBias: 0.68,
    longBias: 0.48,
    stretchBias: 0.7,
    standOffBias: 0.48,
    tempo: 0.9,
    transitionBurst: 0.55,
    receivePatience: 0.62,
  },
  counter: {
    shortBias: 0.32,
    progressiveBias: 0.78,
    longBias: 0.48,
    stretchBias: 0.62,
    standOffBias: 0.68,
    tempo: 0.98,
    transitionBurst: 0.88,
    receivePatience: 0.52,
  },
  direct: {
    shortBias: 0.26,
    progressiveBias: 0.85,
    longBias: 0.72,
    stretchBias: 0.88,
    standOffBias: 0.4,
    tempo: 1.05,
    transitionBurst: 0.78,
    receivePatience: 0.42,
  },
  routeOne: {
    shortBias: 0.14,
    progressiveBias: 0.92,
    longBias: 0.9,
    stretchBias: 0.95,
    standOffBias: 0.35,
    tempo: 1.12,
    transitionBurst: 0.82,
    receivePatience: 0.32,
  },
};

export const PLAY_STYLE_IDS: PlayStyleId[] = [
  "possession",
  "balanced",
  "counter",
  "direct",
  "routeOne",
];

export const PLAY_STYLE_LABELS: Record<PlayStyleChoice, string> = {
  auto: "Auto",
  possession: "Possession",
  balanced: "Balanced",
  counter: "Counter",
  direct: "Direct",
  routeOne: "Route 1",
};

export function isPlayStyleId(value: string | null | undefined): value is PlayStyleId {
  return !!value && (PLAY_STYLE_IDS as string[]).includes(value);
}

export function playStyleProfile(id: PlayStyleId): PlayStyleProfile {
  return { id, ...PROFILES[id] };
}

/** Mean starter overall for a side (fallback 70). */
export function teamMeanOverall(players: Player[]): number {
  const out = players.filter((p) => !p.isGK && !p.sentOff);
  if (!out.length) return 70;
  let sum = 0;
  for (const p of out) sum += p.overall || 70;
  return sum / out.length;
}

function leagueTier(league?: EnglishLeague | string | null): number {
  if (league === "PREMIER_LEAGUE" || league === "LA_LIGA" || league === "SERIE_A") return 1;
  if (league === "CHAMPIONSHIP") return 0.55;
  if (league === "LEAGUE_ONE") return 0.2;
  return 0.4;
}

/**
 * Derive play style from team record + XI strength.
 * Weaker / lower-league sides lean direct / route one; mid-tier → counter; stronger → possession.
 */
export function derivePlayStyle(
  record: Pick<TeamRecord, "league" | "teamType" | "id" | "name"> | null | undefined,
  players: Player[],
): PlayStyleProfile {
  const overall = teamMeanOverall(players);
  const tier = leagueTier(record?.league);
  // 0 = weak/route-one, 1 = strong/possession
  const strength = clamp((overall - 58) / 28, 0, 1) * 0.65 + tier * 0.35;

  let id: PlayStyleId;
  if (strength < 0.28) id = "routeOne";
  else if (strength < 0.42) id = "direct";
  else if (strength < 0.58) id = "counter";
  else if (strength < 0.72) id = "balanced";
  else id = "possession";

  // Historic / international classics: mild nudge toward balanced unless very weak XI.
  if (record?.teamType === "INTERNATIONAL" && id === "routeOne") id = "direct";
  if (record?.teamType === "HISTORIC_TEAM" && id === "possession" && overall < 82) id = "balanced";

  return playStyleProfile(id);
}

/** Override from lineup, or Auto derive. */
export function resolvePlayStyle(
  record: Pick<TeamRecord, "league" | "teamType" | "id" | "name"> | null | undefined,
  players: Player[],
  override?: PlayStyleId | null,
): PlayStyleProfile {
  if (override && isPlayStyleId(override)) return playStyleProfile(override);
  return derivePlayStyle(record, players);
}

/** Pass-scoring deltas applied in PassingAI / AttackingDecision (amplified for watchability). */
export function playStylePassWeights(
  style: PlayStyleProfile,
  opts?: { phase?: string },
): {
  shortBonus: number;
  throughBonus: number;
  longBonus: number;
  buildupCrush: number;
} {
  const phase = opts?.phase;
  const transition = phase === "transition";
  const build = phase === "build" || phase === "buildup";
  let throughBonus = (style.progressiveBias - 0.45) * 1.05;
  let longBonus = (style.longBias - 0.3) * 1.15;
  let shortBonus = (style.shortBias - 0.5) * 0.85;

  if (transition) {
    throughBonus += style.transitionBurst * 0.55;
    longBonus += style.transitionBurst * 0.2;
  }
  if (build && style.id === "counter") {
    longBonus -= 0.22;
    shortBonus += 0.12;
  }
  if (build && style.id === "possession") {
    longBonus -= 0.18;
    shortBonus += 0.2;
  }

  let buildupCrush = 0.72;
  if (style.id === "routeOne" || style.id === "direct") buildupCrush = 0.95;
  else if (style.id === "possession") buildupCrush = 0.48;
  else if (style.id === "counter") buildupCrush = 0.58;

  return { shortBonus, throughBonus, longBonus, buildupCrush };
}
