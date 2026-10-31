import type { FlickBallState } from "./FlickBall";
import type { FlickFigureState } from "./FlickFigure";
import type { FlickAIDifficulty } from "./FlickSetup";

export interface FlickAIProfiles {
  reactionSeconds: number;
  aimNoise: number;
  powerMul: number;
}

export const FLICK_AI_PROFILES: Record<FlickAIDifficulty, FlickAIProfiles> = {
  EASY: { reactionSeconds: 0.55, aimNoise: 0.55, powerMul: 0.72 },
  NORMAL: { reactionSeconds: 0.32, aimNoise: 0.32, powerMul: 0.88 },
  HARD: { reactionSeconds: 0.18, aimNoise: 0.16, powerMul: 1.0 },
  EXPERT: { reactionSeconds: 0.1, aimNoise: 0.08, powerMul: 1.08 },
};

export interface FlickAIDecision {
  figureId: string;
  /** Pull-back vector (opposite of desired travel). */
  pullDx: number;
  pullDz: number;
}

/**
 * Pick an outfield figure and aim to strike the ball toward the attacking goal.
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

  // Prefer figure nearest ball with a clear path toward attack.
  let best = outfield[0]!;
  let bestScore = -Infinity;
  const attackX = side === "home" ? 1 : -1;
  for (const f of outfield) {
    const dist = Math.hypot(f.x - ball.x, f.z - ball.z);
    const ahead = (ball.x - f.x) * attackX;
    const score = -dist + ahead * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  // Desired travel: from figure through ball, then toward goal.
  const toBallX = ball.x - best.x;
  const toBallZ = ball.z - best.z;
  const distBall = Math.hypot(toBallX, toBallZ) || 1;
  let dirX = toBallX / distBall;
  let dirZ = toBallZ / distBall;
  // Bias toward goal once close to ball.
  if (distBall < 1.8) {
    dirX = dirX * 0.55 + attackX * 0.45;
    dirZ *= 0.55;
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

  const pullLen = (0.35 + Math.random() * 0.45) * profile.powerMul;
  // Pull opposite desired travel.
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
