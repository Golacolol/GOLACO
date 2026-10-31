import { clamp } from "../../core/math";
import { HALF_LENGTH, HALF_WIDTH } from "../constants";
import type { Player } from "../players/Player";
import { celebrationCorner } from "./KickOff";

/** Moving celebrations — scorer runs, then holds the pose until skip/timer. */
export const CELEBRATION_ROUTINES = [
  "corner",
  "slide",
  "crowd",
  "byline",
  "channel",
  "knee",
  "point",
  "group",
] as const;
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

  if (routine === "slide" || routine === "knee") {
    return {
      x: clamp(scorer.x + attack * (routine === "knee" ? 5.5 : 8.5), -HALF_LENGTH + 4, HALF_LENGTH - 2),
      z: clamp(scorer.z + (scorer.z >= 0 ? 6.5 : -6.5), -HALF_WIDTH + 2, HALF_WIDTH - 2),
    };
  }

  if (routine === "byline") {
    return {
      x: clamp(goalX - attack * 2.2, -HALF_LENGTH + 1.2, HALF_LENGTH - 1.2),
      z: nearTouch,
    };
  }

  if (routine === "point") {
    // Jog toward the technical area / dugout side, then pose.
    return {
      x: clamp(scorer.x - attack * 4.5, -HALF_LENGTH + 6, HALF_LENGTH - 6),
      z: clamp(nearTouch * 0.55, -HALF_WIDTH + 3, HALF_WIDTH - 3),
    };
  }

  if (routine === "group") {
    // Short gather in open grass so teammates can join.
    return {
      x: clamp(scorer.x + attack * 4, -HALF_LENGTH + 8, HALF_LENGTH - 8),
      z: clamp(scorer.z * 0.4, -14, 14),
    };
  }

  // channel — drive up the opposite flank into space
  return {
    x: clamp(scorer.x + attack * 14, -HALF_LENGTH + 5, HALF_LENGTH - 3),
    z: clamp(farTouch * 0.72 + scorer.z * 0.15, -HALF_WIDTH + 2.5, HALF_WIDTH - 2.5),
  };
}

/** Knee / point hold after a short jog; others keep moving until they arrive. */
export function celebrationStaysPut(routine: CelebrationRoutine): boolean {
  return routine === "point" || routine === "group";
}

function defaultPose(routine: CelebrationRoutine): Player["celebrationKind"] {
  if (routine === "slide" || routine === "knee") return "slide";
  if (routine === "byline" || routine === "point") return "jump";
  if (routine === "channel" || routine === "group") return "team";
  return "arms";
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
  scorer.celebrationKind = defaultPose(routine);

  const pack = teammates
    .filter((p) => p.id !== scorer.id && !p.isGK && p.distTo(scorer.x, scorer.z) < 30)
    .sort((a, b) => a.distTo(scorer.x, scorer.z) - b.distTo(scorer.x, scorer.z))
    .slice(0, routine === "group" ? 7 : 5);

  for (let i = 0; i < pack.length; i++) {
    const p = pack[i];
    p.celebrating = true;
    p.celebrationKind = i % 3 === 0 ? "arms" : i % 3 === 1 ? "team" : "jump";
    const t = 0.28 + i * 0.1;
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
