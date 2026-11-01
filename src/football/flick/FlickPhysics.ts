import type { FlickBallState } from "./FlickBall";
import type { FlickFigureState } from "./FlickFigure";
import { figureSpeed } from "./FlickFigure";
import { FLICK_PITCH, halfLength, halfWidth, type FlickPitchDims } from "./FlickPitch";

/** Rest threshold — slightly higher on full-pitch scale so settle still feels snappy. */
export const FLICK_REST_SPEED = 0.45;
export const FLICK_SETTLE_HOLD = 0.35;

/**
 * Exponential damp rate for figures (1/s). Tuned so a max-power flick coasts
 * past half a REAL pitch (~52m); the old 2.4 left strong flicks short at ~30m.
 */
export const FLICK_FIGURE_FRICTION = 1.85;
const BALL_FRICTION = 1.05;
const MAX_LEAN = 0.18;

/** Coasting distance until speed drops below rest (matches stepFlickFriction). */
export function estimateFlickCoastDistance(
  speed: number,
  friction: number = FLICK_FIGURE_FRICTION,
  rest: number = FLICK_REST_SPEED,
): number {
  if (speed <= rest) return 0;
  return (speed - rest) / friction;
}

export function stepFlickFriction(fig: FlickFigureState, dt: number): void {
  const damp = Math.exp(-FLICK_FIGURE_FRICTION * dt);
  fig.vx *= damp;
  fig.vz *= damp;
  if (figureSpeed(fig) < FLICK_REST_SPEED) {
    fig.vx = 0;
    fig.vz = 0;
  }
}

export function stepBallFriction(ball: FlickBallState, dt: number): void {
  const damp = Math.exp(-BALL_FRICTION * dt);
  ball.vx *= damp;
  ball.vz *= damp;
  if (Math.hypot(ball.vx, ball.vz) < FLICK_REST_SPEED * 0.85) {
    ball.vx = 0;
    ball.vz = 0;
  }
}

/** Cosmetic lean from velocity; snap upright when nearly still — no wobble. */
export function updateFigureLean(fig: FlickFigureState): void {
  const sp = figureSpeed(fig);
  if (sp < FLICK_REST_SPEED) {
    fig.leanX = 0;
    fig.leanZ = 0;
    fig.settled = true;
    return;
  }
  fig.settled = false;
  const nx = fig.vx / sp;
  const nz = fig.vz / sp;
  const amt = Math.min(MAX_LEAN, sp * 0.035);
  fig.leanX = -nz * amt;
  fig.leanZ = nx * amt;
}

function resolveCircle(
  ax: number,
  az: number,
  ar: number,
  bx: number,
  bz: number,
  br: number,
): { ox: number; oz: number; overlap: number } | null {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const min = ar + br;
  if (dist >= min || dist < 1e-8) return null;
  const inv = 1 / dist;
  return { ox: dx * inv, oz: dz * inv, overlap: min - dist };
}

export function collideFigures(a: FlickFigureState, b: FlickFigureState): void {
  const hit = resolveCircle(a.x, a.z, a.radius, b.x, b.z, b.radius);
  if (!hit) return;
  const push = hit.overlap * 0.52;
  a.x -= hit.ox * push;
  a.z -= hit.oz * push;
  b.x += hit.ox * push;
  b.z += hit.oz * push;
  // Elastic-ish exchange along normal.
  const relVx = a.vx - b.vx;
  const relVz = a.vz - b.vz;
  const vn = relVx * hit.ox + relVz * hit.oz;
  if (vn > 0) return;
  const bounce = 0.72;
  const j = -vn * bounce;
  a.vx += hit.ox * j;
  a.vz += hit.oz * j;
  b.vx -= hit.ox * j;
  b.vz -= hit.oz * j;
  a.settled = false;
  b.settled = false;
}

/**
 * Planar hit using the full base disc and the full ball radius (not a point).
 * Returns true when the figure meaningfully strikes the ball (for last-touch).
 */
export function collideFigureBall(fig: FlickFigureState, ball: FlickBallState): boolean {
  // Full Subbuteo base footprint + full ball disc (slightly generous so grazes still catch).
  const hit = resolveCircle(fig.x, fig.z, fig.radius, ball.x, ball.z, ball.radius * 1.08);
  if (!hit) return false;
  const push = hit.overlap * 0.55;
  fig.x -= hit.ox * push * 0.35;
  fig.z -= hit.oz * push * 0.35;
  ball.x += hit.ox * push * 0.65;
  ball.z += hit.oz * push * 0.65;
  // Normal points fig → ball. vn > 0 means the figure is closing on the ball.
  const relVx = fig.vx - ball.vx;
  const relVz = fig.vz - ball.vz;
  const vn = relVx * hit.ox + relVz * hit.oz;
  let struck = false;
  if (vn > 0.05) {
    // Flick strike: ball takes the bulk of the figure's velocity (plus closing boost).
    const transfer = 1.08;
    ball.vx = fig.vx * transfer + hit.ox * vn * 0.25;
    ball.vz = fig.vz * transfer + hit.oz * vn * 0.25;
    fig.vx *= 0.38;
    fig.vz *= 0.38;
    struck = true;
  } else if (vn < -0.05) {
    // Separating — light restitution only.
    const j = -vn * 0.35;
    ball.vx -= hit.ox * j;
    ball.vz -= hit.oz * j;
    fig.vx += hit.ox * j * 0.25;
    fig.vz += hit.oz * j * 0.25;
  } else {
    // Nested / slow contact — still a touch for possession.
    struck = figureSpeed(fig) > FLICK_REST_SPEED * 0.5 || Math.hypot(ball.vx, ball.vz) > FLICK_REST_SPEED * 0.5;
  }
  fig.settled = false;
  return struck;
}

export function clampFigureToPitch(fig: FlickFigureState, dims: FlickPitchDims = FLICK_PITCH): void {
  const hl = halfLength(dims) - fig.radius * 0.85;
  const hw = halfWidth(dims) - fig.radius * 0.85;
  if (fig.x < -hl) {
    fig.x = -hl;
    fig.vx = Math.abs(fig.vx) * 0.35;
  } else if (fig.x > hl) {
    fig.x = hl;
    fig.vx = -Math.abs(fig.vx) * 0.35;
  }
  if (fig.z < -hw) {
    fig.z = -hw;
    fig.vz = Math.abs(fig.vz) * 0.35;
  } else if (fig.z > hw) {
    fig.z = hw;
    fig.vz = -Math.abs(fig.vz) * 0.35;
  }
}

/**
 * Soft in-play clamp only. Touchlines and goal-lines outside the mouth are left
 * open so throw-ins / corners / goal-kicks can be awarded (Subbuteo style).
 * Goal mouth stays open for scoring; posts still bounce.
 */
export function clampBallToPitch(ball: FlickBallState, dims: FlickPitchDims = FLICK_PITCH): void {
  const hl = halfLength(dims);
  const halfG = dims.goalWidth / 2;
  // Soft bounce off the posts (goal-line just outside the mouth).
  if (ball.x > hl - ball.radius && Math.abs(ball.z) > halfG && Math.abs(ball.z) < halfG + ball.radius * 1.2) {
    if (Math.abs(ball.z) - halfG < ball.radius) {
      ball.z = Math.sign(ball.z) * (halfG + ball.radius * 0.15);
      ball.vz *= -0.45;
    }
  } else if (ball.x < -hl + ball.radius && Math.abs(ball.z) > halfG && Math.abs(ball.z) < halfG + ball.radius * 1.2) {
    if (Math.abs(ball.z) - halfG < ball.radius) {
      ball.z = Math.sign(ball.z) * (halfG + ball.radius * 0.15);
      ball.vz *= -0.45;
    }
  }
  ball.y = dims.playY + ball.radius;
}

export type FlickRestartKind = "throwIn" | "corner" | "goalKick";

export interface FlickRestart {
  kind: FlickRestartKind;
  /** Side that takes the restart. */
  awardTo: "home" | "away";
  x: number;
  z: number;
}

/**
 * Subbuteo-style out-of-play:
 * - Touchline → throw-in to the side that did not last touch (possession lost).
 * - Own goal-line (outside mouth) last touched by defender → corner to attacker.
 * - Own goal-line last touched by attacker → goal-kick to defender.
 */
export function checkFlickOutOfPlay(
  ball: FlickBallState,
  lastTouch: "home" | "away" | null,
  dims: FlickPitchDims = FLICK_PITCH,
): FlickRestart | null {
  if (checkFlickGoalImport(ball, dims)) return null;
  const hl = halfLength(dims);
  const hw = halfWidth(dims);
  const halfG = dims.goalWidth / 2;
  const touch = lastTouch ?? "home";

  if (ball.z - ball.radius >= hw || ball.z + ball.radius <= -hw) {
    const awardTo: "home" | "away" = touch === "home" ? "away" : "home";
    const z = ball.z >= 0 ? hw - ball.radius * 0.2 : -hw + ball.radius * 0.2;
    const x = Math.max(-hl + 3, Math.min(hl - 3, ball.x));
    return { kind: "throwIn", awardTo, x, z };
  }

  // Away goal-line (+X), outside the mouth.
  if (ball.x - ball.radius >= hl && Math.abs(ball.z) > halfG) {
    if (touch === "away") {
      const z = ball.z >= 0 ? hw - 0.8 : -hw + 0.8;
      return { kind: "corner", awardTo: "home", x: hl - 0.8, z };
    }
    return { kind: "goalKick", awardTo: "away", x: hl - Math.min(dims.boxDepth * 0.35, 6), z: 0 };
  }
  // Home goal-line (−X), outside the mouth.
  if (ball.x + ball.radius <= -hl && Math.abs(ball.z) > halfG) {
    if (touch === "home") {
      const z = ball.z >= 0 ? hw - 0.8 : -hw + 0.8;
      return { kind: "corner", awardTo: "away", x: -hl + 0.8, z };
    }
    return { kind: "goalKick", awardTo: "home", x: -hl + Math.min(dims.boxDepth * 0.35, 6), z: 0 };
  }
  return null;
}

/** Local import-free goal check used by out-of-play (avoids circular imports). */
function checkFlickGoalImport(ball: FlickBallState, dims: FlickPitchDims): boolean {
  const hl = dims.length / 2;
  const halfG = dims.goalWidth / 2 + ball.radius * 0.35;
  if (Math.abs(ball.z) > halfG) return false;
  return ball.x - ball.radius >= hl || ball.x + ball.radius <= -hl;
}

export function everythingSettled(
  figures: FlickFigureState[],
  ball: FlickBallState,
): boolean {
  if (Math.hypot(ball.vx, ball.vz) > FLICK_REST_SPEED * 0.9) return false;
  for (const f of figures) {
    if (figureSpeed(f) > FLICK_REST_SPEED) return false;
  }
  return true;
}

/**
 * Advance flick physics. Sub-steps when pieces move fast so the full base disc
 * cannot tunnel through the full ball disc in one frame.
 * Returns the side of the last figure that struck the ball this tick (if any).
 */
export function stepFlickWorld(
  figures: FlickFigureState[],
  ball: FlickBallState,
  dt: number,
  dims: FlickPitchDims = FLICK_PITCH,
): "home" | "away" | null {
  let maxSp = Math.hypot(ball.vx, ball.vz);
  for (const f of figures) maxSp = Math.max(maxSp, figureSpeed(f));
  const maxTravel = Math.max(0.12, Math.min(dims.figureRadius, dims.ballRadius) * 0.4);
  const steps = Math.max(1, Math.min(16, Math.ceil((maxSp * dt) / maxTravel)));
  const sub = dt / steps;
  let lastStrike: "home" | "away" | null = null;

  for (let s = 0; s < steps; s++) {
    for (const f of figures) {
      f.x += f.vx * sub;
      f.z += f.vz * sub;
      stepFlickFriction(f, sub);
      clampFigureToPitch(f, dims);
      updateFigureLean(f);
    }
    ball.x += ball.vx * sub;
    ball.z += ball.vz * sub;
    stepBallFriction(ball, sub);
    clampBallToPitch(ball, dims);

    for (let i = 0; i < figures.length; i++) {
      for (let j = i + 1; j < figures.length; j++) {
        collideFigures(figures[i]!, figures[j]!);
      }
      if (collideFigureBall(figures[i]!, ball)) lastStrike = figures[i]!.side;
    }
    for (const f of figures) clampFigureToPitch(f, dims);
    clampBallToPitch(ball, dims);
  }
  return lastStrike;
}
