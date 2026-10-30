/**
 * REAL / ARCADE share Match AI (ARCADE = multipliers only).
 * TABLE is a separate foosball engine (`src/football/table/`) — no Match AI path.
 */
export type GameplayMode = "REAL" | "ARCADE" | "TABLE";

export interface GameplayTuning {
  id: GameplayMode;
  movementAccelerationMultiplier: number;
  maxSpeedMultiplier: number;
  turnMultiplier: number;
  passSpeedMultiplier: number;
  passErrorMultiplier: number;
  shotPowerMultiplier: number;
  shotErrorMultiplier: number;
  staminaDrainMultiplier: number;
  firstTouchErrorMultiplier: number;
  tackleWindowMultiplier: number;
  longShotDecisionMultiplier: number;
  attackingRunMultiplier: number;
  keeperReactionMultiplier: number;
  ballFrictionMultiplier: number;
  celebrationDurationMultiplier: number;
  passUrgencyMultiplier: number;
  /** Open-play dribble magnet (1 = sticky; lower = freer ball between touches). */
  dribbleMagnetMultiplier: number;
  /** Close defenders poke / redirect the ball without a slide. */
  defenderDisturbMultiplier: number;
  /** Sharp-turn spill while carrying. */
  turnLooseMultiplier: number;
  /** Ground duel upset / dice weight when both sides contest a loose ball. */
  groundContestUpsetMultiplier: number;
  /** Post-kick aftertouch / banana curve strength. */
  aftertouchMultiplier: number;
  /** Aerial duel upset / dice weight (headers). */
  headerContestUpsetMultiplier: number;
  /** How strongly jump timing + height decide header winners. */
  headerTimingMultiplier: number;
  /** Lateral dive stretch on shots. */
  keeperDiveReachMultiplier: number;
  /** Higher = more held catches vs punched/parried saves. */
  keeperHoldBiasMultiplier: number;
  /** Length of post-turnover counter-press window. */
  counterPressWindowMultiplier: number;
  /** How hard defenders hunt during that window. */
  counterPressAggressionMultiplier: number;
}

export const REAL_TUNING: GameplayTuning = {
  id: "REAL",
  movementAccelerationMultiplier: 0.9,
  maxSpeedMultiplier: 0.94,
  turnMultiplier: 1,
  passSpeedMultiplier: 1,
  passErrorMultiplier: 1.04,
  shotPowerMultiplier: 0.94,
  shotErrorMultiplier: 1.08,
  staminaDrainMultiplier: 1,
  firstTouchErrorMultiplier: 1,
  tackleWindowMultiplier: 1,
  longShotDecisionMultiplier: 1.05,
  attackingRunMultiplier: 0.92,
  keeperReactionMultiplier: 1.06,
  ballFrictionMultiplier: 1,
  celebrationDurationMultiplier: 1,
  passUrgencyMultiplier: 0.88,
  dribbleMagnetMultiplier: 0.72,
  defenderDisturbMultiplier: 0.72,
  turnLooseMultiplier: 1.05,
  groundContestUpsetMultiplier: 1,
  aftertouchMultiplier: 1,
  headerContestUpsetMultiplier: 1,
  headerTimingMultiplier: 1.08,
  keeperDiveReachMultiplier: 1.05,
  keeperHoldBiasMultiplier: 0.94,
  counterPressWindowMultiplier: 0.85,
  counterPressAggressionMultiplier: 0.92,
};

/** ARCADE stays multiplier-only off the same AI — faster, freer, more chaos. */
export const ARCADE_TUNING: GameplayTuning = {
  id: "ARCADE",
  movementAccelerationMultiplier: 1.34,
  maxSpeedMultiplier: 1.16,
  turnMultiplier: 1.28,
  passSpeedMultiplier: 1.2,
  passErrorMultiplier: 0.68,
  shotPowerMultiplier: 1.28,
  shotErrorMultiplier: 0.74,
  staminaDrainMultiplier: 0.58,
  firstTouchErrorMultiplier: 0.66,
  tackleWindowMultiplier: 1.16,
  longShotDecisionMultiplier: 1.55,
  attackingRunMultiplier: 1.32,
  keeperReactionMultiplier: 0.86,
  ballFrictionMultiplier: 0.88,
  celebrationDurationMultiplier: 0.58,
  passUrgencyMultiplier: 1.14,
  dribbleMagnetMultiplier: 0.94,
  defenderDisturbMultiplier: 0.68,
  turnLooseMultiplier: 0.54,
  groundContestUpsetMultiplier: 0.66,
  aftertouchMultiplier: 1.18,
  headerContestUpsetMultiplier: 0.68,
  headerTimingMultiplier: 0.82,
  keeperDiveReachMultiplier: 1.22,
  keeperHoldBiasMultiplier: 1.14,
  counterPressWindowMultiplier: 1.32,
  counterPressAggressionMultiplier: 1.35,
};

export function tuningFor(mode: GameplayMode | undefined): GameplayTuning {
  return mode === "ARCADE" ? ARCADE_TUNING : REAL_TUNING;
}

export const MODE_BLURBS: Record<GameplayMode, string> = {
  REAL: "Tactical, ratings-driven, measured football.",
  ARCADE: "Faster, freer, more chaos — same AI, expressive multipliers only.",
  TABLE: "Foosball rods — twist, slide, spin. AI or hotseat 2P.",
};
