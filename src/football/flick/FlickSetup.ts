import type { AdvertisingBoardRecord, StadiumRecord, TeamKit } from "../../data/schema";
import type { EnvironmentPreset } from "../environment/Environment";

export type FlickOpponent = "AI" | "HUMAN";
export type FlickAIDifficulty = "EASY" | "NORMAL" | "HARD" | "EXPERT";
export type FlickGraphicsPreset = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface FlickMatchConfig {
  opponent: FlickOpponent;
  difficulty: FlickAIDifficulty;
  /** First to this many goals (default 5). */
  firstTo: number;
  homeColor: number;
  awayColor: number;
  /** Human side when vs AI (always home for v1). */
  humanSide: "home" | "away";
  /**
   * Classic alternate flicks when true.
   * When false, either side may flick whenever the pitch is settled — AI reacts
   * on its difficulty timer and will attempt shots without waiting for a turn.
   */
  turnBased: boolean;
}

/** REAL stadium host for Flickball — same world as Match, different rules. */
export interface FlickWorldContext {
  stadium: StadiumRecord;
  advertising: AdvertisingBoardRecord[];
  homePrimary: string;
  awayPrimary: string;
  homeKit: TeamKit;
  awayKit: TeamKit;
  env: EnvironmentPreset;
  graphicsPreset: FlickGraphicsPreset;
}

export const DEFAULT_FLICK_CONFIG: FlickMatchConfig = {
  opponent: "AI",
  difficulty: "NORMAL",
  firstTo: 5,
  homeColor: 0x034694,
  awayColor: 0xffffff,
  humanSide: "home",
  turnBased: true,
};

export function normalizeFlickConfig(partial?: Partial<FlickMatchConfig> | null): FlickMatchConfig {
  const base = { ...DEFAULT_FLICK_CONFIG, ...(partial ?? {}) };
  base.firstTo = Math.max(1, Math.min(21, base.firstTo || 5));
  if (base.opponent !== "HUMAN") base.opponent = "AI";
  if (base.humanSide !== "away") base.humanSide = "home";
  const diffs: FlickAIDifficulty[] = ["EASY", "NORMAL", "HARD", "EXPERT"];
  if (!diffs.includes(base.difficulty)) base.difficulty = "NORMAL";
  base.turnBased = base.turnBased !== false;
  return base;
}
