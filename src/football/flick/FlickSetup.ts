export type FlickOpponent = "AI" | "HUMAN";
export type FlickAIDifficulty = "EASY" | "NORMAL" | "HARD" | "EXPERT";

export interface FlickMatchConfig {
  opponent: FlickOpponent;
  difficulty: FlickAIDifficulty;
  /** First to this many goals (default 5). */
  firstTo: number;
  homeColor: number;
  awayColor: number;
  /** Human side when vs AI (always home for v1). */
  humanSide: "home" | "away";
}

export const DEFAULT_FLICK_CONFIG: FlickMatchConfig = {
  opponent: "AI",
  difficulty: "NORMAL",
  firstTo: 5,
  homeColor: 0x034694,
  awayColor: 0xffffff,
  humanSide: "home",
};

export function normalizeFlickConfig(partial?: Partial<FlickMatchConfig> | null): FlickMatchConfig {
  const base = { ...DEFAULT_FLICK_CONFIG, ...(partial ?? {}) };
  base.firstTo = Math.max(1, Math.min(21, base.firstTo || 5));
  if (base.opponent !== "HUMAN") base.opponent = "AI";
  if (base.humanSide !== "away") base.humanSide = "home";
  const diffs: FlickAIDifficulty[] = ["EASY", "NORMAL", "HARD", "EXPERT"];
  if (!diffs.includes(base.difficulty)) base.difficulty = "NORMAL";
  return base;
}
