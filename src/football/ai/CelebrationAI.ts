import { clamp } from "../../core/math";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";
import type { Player } from "../players/Player";
import { celebrationCorner } from "./KickOff";

/** Five moving celebrations — scorer always runs; teammates follow. */
export const CELEBRATION_ROUTINES = ["corner", "slide", "crowd", "byline", "channel"] as const;
export type CelebrationRoutine = (typeof CELEBRATION_ROUTINES)[number];

export function pickCelebrationRoutine(rng: () => number = Math.random): CelebrationRoutine {
  const i = Math.min(CELEBRATION_ROUTINES.length - 1, Math.floor(rng() * CELEBRATION_ROUTINES.length));
  return CELEBRATION_ROUTINES[i];
}

export function celebrationTarget(scorer: Player, routine: CelebrationRoutine): { x: number; z: number } {
  const attack = scorer.attackSign;
  const nearTouch = (scorer.z >= 0 ? 1 : -1) * (HALF_WIDTH - 1.2);
  const farTouch = (scorer.z >= 0 ? -1 : 1) * (HALF_WIDTH - 1.4);
  const goalX = scorer.oppGoalX();

  if (routine === "corner") return celebrationCorner(scorer);

  if (routine === "crowd") {
    return {
      x: clamp(scorer.x + attack * 3.2, -HALF_LENGTH + 3, HALF_LENGTH - 3),
      z: nearTouch,
    };
  }

  if (routine === "slide") {
    return {
      x: clamp(scorer.x + attack * 8.5, -HALF_LENGTH + 4, HALF_LENGTH - 2),
      z: clamp(scorer.z + (scorer.z >= 0 ? 6.5 : -6.5), -HALF_WIDTH + 2, HALF_WIDTH - 2),
    };
  }

  if (routine === "byline") {
    // Charge along the goal line toward the near corner flag.
    return {
      x: clamp(goalX - attack * 2.2, -HALF_LENGTH + 1.2, HALF_LENGTH - 1.2),
      z: nearTouch,
    };
  }

  // channel — drive up the opposite flank into space
  return {
    x: clamp(scorer.x + attack * 14, -HALF_LENGTH + 5, HALF_LENGTH - 3),
    z: clamp(farTouch * 0.72 + scorer.z * 0.15, -HALF_WIDTH + 2.5, HALF_WIDTH - 2.5),
  };
}

/** All current routines are moving; kept for callers/tests. */
export function celebrationStaysPut(_routine: CelebrationRoutine): boolean {
  return false;
}

export function celebrateAI(
  scorer: Player,
  teammates: Player[],
  rng: () => number = Math.random,
): CelebrationRoutine {
  const routine = pickCelebrationRoutine(rng);
  const target = celebrationTarget(scorer, routine);
  scorer.celebrating = true;
  scorer.runTargetX = target.x;
  scorer.runTargetZ = target.z;
  scorer.desiredX = target.x;
  scorer.desiredZ = target.z;
  scorer.celebrationKind =
    routine === "slide" ? "slide" : routine === "byline" ? "jump" : routine === "channel" ? "team" : "arms";

  const pack = teammates
    .filter((p) => p.id !== scorer.id && !p.isGK && p.distTo(scorer.x, scorer.z) < 30)
    .sort((a, b) => a.distTo(scorer.x, scorer.z) - b.distTo(scorer.x, scorer.z))
    .slice(0, 5);

  for (let i = 0; i < pack.length; i++) {
    const p = pack[i];
    p.celebrating = true;
    p.celebrationKind = i % 2 === 0 ? "arms" : "team";
    // Spread followers around the scorer's run path so the pack streams with him.
    const t = 0.35 + i * 0.12;
    p.desiredX = scorer.x * (1 - t) + target.x * t + (Math.random() - 0.5) * 3.2;
    p.desiredZ = scorer.z * (1 - t) + target.z * t + (Math.random() - 0.5) * 3.2;
    p.runTargetX = p.desiredX;
    p.runTargetZ = p.desiredZ;
  }
  return routine;
}

export function concedeReaction(players: Player[]): void {
  for (const p of players) {
    p.vx *= 0.3;
    p.vz *= 0.3;
    p.celebrating = false;
  }
}

export function clearCelebration(players: Player[]): void {
  for (const p of players) {
    p.celebrating = false;
    p.celebrationKind = "none";
  }
}
