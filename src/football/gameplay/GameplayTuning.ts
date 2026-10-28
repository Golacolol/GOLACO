export type GameplayMode = "REAL" | "ARCADE";

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
  passSpeedMultiplier: 0.9,
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
  dribbleMagnetMultiplier: 0.48,
  defenderDisturbMultiplier: 1.18,
  turnLooseMultiplier: 1.12,
  groundContestUpsetMultiplier: 1,
  aftertouchMultiplier: 1,
  headerContestUpsetMultiplier: 1,
  headerTimingMultiplier: 1.08,
  keeperDiveReachMultiplier: 1.05,
  keeperHoldBiasMultiplier: 0.94,
  counterPressWindowMultiplier: 0.85,
  counterPressAggressionMultiplier: 0.92,
};

export const ARCADE_TUNING: GameplayTuning = {
  id: "ARCADE",
  movementAccelerationMultiplier: 1.28,
  maxSpeedMultiplier: 1.12,
  turnMultiplier: 1.22,
  passSpeedMultiplier: 1.16,
  passErrorMultiplier: 0.72,
  shotPowerMultiplier: 1.22,
  shotErrorMultiplier: 0.78,
  staminaDrainMultiplier: 0.62,
  firstTouchErrorMultiplier: 0.7,
  tackleWindowMultiplier: 1.12,
  longShotDecisionMultiplier: 1.45,
  attackingRunMultiplier: 1.25,
  keeperReactionMultiplier: 0.88,
  ballFrictionMultiplier: 0.9,
  celebrationDurationMultiplier: 0.62,
  passUrgencyMultiplier: 1.08,
  dribbleMagnetMultiplier: 0.92,
  defenderDisturbMultiplier: 0.72,
  turnLooseMultiplier: 0.58,
  groundContestUpsetMultiplier: 0.7,
  aftertouchMultiplier: 1.12,
  headerContestUpsetMultiplier: 0.72,
  headerTimingMultiplier: 0.85,
  keeperDiveReachMultiplier: 1.18,
  keeperHoldBiasMultiplier: 1.12,
  counterPressWindowMultiplier: 1.25,
  counterPressAggressionMultiplier: 1.28,
};

export function tuningFor(mode: GameplayMode | undefined): GameplayTuning {
  return mode === "ARCADE" ? ARCADE_TUNING : REAL_TUNING;
}

export const MODE_BLURBS: Record<GameplayMode, string> = {
  REAL: "Tactical, ratings-driven, measured football.",
  ARCADE: "Faster, more responsive, more dramatic football.",
};
