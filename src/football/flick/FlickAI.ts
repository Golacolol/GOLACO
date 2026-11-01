import type { FlickBallState } from "./FlickBall";
import {
  FLICK_MAX_POWER,
  FLICK_MIN_PULL,
  pullLengthForPower,
  type FlickFigureState,
} from "./FlickFigure";
import { FLICK_FIGURE_FRICTION, FLICK_REST_SPEED } from "./FlickPhysics";
import type { FlickAIDifficulty } from "./FlickSetup";

export interface FlickAIProfiles {
  reactionSeconds: number;
  aimNoise: number;
  powerMul: number;
}

export const FLICK_AI_PROFILES: Record<FlickAIDifficulty, FlickAIProfiles> = {
  EASY: { reactionSeconds: 0.55, aimNoise: 0.22, powerMul: 0.95 },
  NORMAL: { reactionSeconds: 0.32, aimNoise: 0.11, powerMul: 1.05 },
  HARD: { reactionSeconds: 0.18, aimNoise: 0.05, powerMul: 1.1 },
  EXPERT: { reactionSeconds: 0.1, aimNoise: 0.02, powerMul: 1.15 },
};

/** Desired leftover speed (m/s) when the figure reaches the ball — a range per difficulty. */
const FLICK_AI_CONTACT_SPEED: Record<FlickAIDifficulty, readonly [number, number]> = {
  EASY: [16, 26],
  NORMAL: [24, 38],
  HARD: [32, 48],
  EXPERT: [38, 58],
};

export interface FlickAIDecision {
  figureId: string;
  /** Pull-back vector (opposite of desired travel). */
  pullDx: number;
  pullDz: number;
}

/** Launch speed needed to coast `distance` metres (same model as figure friction). */
export function powerForCoastDistance(distance: number): number {
  return Math.max(0, distance) * FLICK_FIGURE_FRICTION + FLICK_REST_SPEED;
}

/**
 * Pick an outfield figure and aim to strike the ball toward the attacking goal.
 * Power is derived from distance-to-ball so long flicks actually arrive.
 */
export function decideFlickAI(
  figures: FlickFigureState[],
  ball: FlickBallState,
  side: "home" | "away",
  difficulty: FlickAIDifficulty,
): FlickAIDecision | null {
  const profile = FLICK_AI_PROFILES[difficulty];
  const outfield = figures.filter((f) => f.side === side && !f.isGK);
  if (!outfield.length) return null;

  // Prefer the nearest figure that sits behind the ball (can strike toward attack).
  let best = outfield[0]!;
  let bestScore = -Infinity;
  const attackX = side === "home" ? 1 : -1;
  for (const f of outfield) {
    const dist = Math.hypot(f.x - ball.x, f.z - ball.z);
    const behind = (ball.x - f.x) * attackX;
    const canStrike = behind >= -1.5;
    // Nearest striker-side figure wins; small behind bonus only as a tie-break.
    const score = (canStrike ? 500 : 0) - dist + Math.min(Math.max(behind, -4), 10) * 0.08;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  // Desired travel: primarily at the ball; light goal bias only when already close.
  const toBallX = ball.x - best.x;
  const toBallZ = ball.z - best.z;
  const distBall = Math.hypot(toBallX, toBallZ) || 1;
  let dirX = toBallX / distBall;
  let dirZ = toBallZ / distBall;
  if (distBall < 6) {
    dirX = dirX * 0.78 + attackX * 0.22;
    dirZ *= 0.78;
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;
  }

  const noise = profile.aimNoise;
  dirX += (Math.random() - 0.5) * noise;
  dirZ += (Math.random() - 0.5) * noise;
  const nlen = Math.hypot(dirX, dirZ) || 1;
  dirX /= nlen;
  dirZ /= nlen;

  // Power = coast-to-ball + leftover contact speed (range), so long flicks still hit hard.
  const [lo, hi] = FLICK_AI_CONTACT_SPEED[difficulty];
  const contactSpeed = (lo + Math.random() * (hi - lo)) * profile.powerMul;
  const needPower = Math.min(FLICK_MAX_POWER, powerForCoastDistance(distBall) + contactSpeed);
  let pullLen = pullLengthForPower(needPower);
  pullLen = Math.max(FLICK_MIN_PULL + 0.15, pullLen);

  return {
    figureId: best.id,
    pullDx: -dirX * pullLen,
    pullDz: -dirZ * pullLen,
  };
}

export class FlickAI {
  difficulty: FlickAIDifficulty;
  private thinkT = 0;

  constructor(difficulty: FlickAIDifficulty) {
    this.difficulty = difficulty;
  }

  resetThink(): void {
    this.thinkT = FLICK_AI_PROFILES[this.difficulty].reactionSeconds * (0.7 + Math.random() * 0.6);
  }

  /** Countdown; when ready returns a decision. */
  update(
    dt: number,
    figures: FlickFigureState[],
    ball: FlickBallState,
    side: "home" | "away",
  ): FlickAIDecision | null {
    this.thinkT -= dt;
    if (this.thinkT > 0) return null;
    this.thinkT = 999;
    return decideFlickAI(figures, ball, side, this.difficulty);
  }
}
