import type { FlickBallState } from "./FlickBall";
import type { FlickFigureState } from "./FlickFigure";
import { figureSpeed } from "./FlickFigure";
import { FLICK_PITCH, halfLength, halfWidth, type FlickPitchDims } from "./FlickPitch";

export const FLICK_REST_SPEED = 0.12;
export const FLICK_SETTLE_HOLD = 0.35;

const FIGURE_FRICTION = 3.8;
const BALL_FRICTION = 1.65;
const MAX_LEAN = 0.18;

export function stepFlickFriction(fig: FlickFigureState, dt: number): void {
  const damp = Math.exp(-FIGURE_FRICTION * dt);
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

export function collideFigureBall(fig: FlickFigureState, ball: FlickBallState): void {
  const hit = resolveCircle(fig.x, fig.z, fig.radius, ball.x, ball.z, ball.radius);
  if (!hit) return;
  const push = hit.overlap * 0.55;
  fig.x -= hit.ox * push * 0.35;
  fig.z -= hit.oz * push * 0.35;
  ball.x += hit.ox * push * 0.65;
  ball.z += hit.oz * push * 0.65;
  const relVx = fig.vx - ball.vx;
  const relVz = fig.vz - ball.vz;
  const vn = relVx * hit.ox + relVz * hit.oz;
  if (vn <= 0) {
    // Transfer flick energy into ball.
    const transfer = 0.85;
    ball.vx += fig.vx * transfer;
    ball.vz += fig.vz * transfer;
    fig.vx *= 0.55;
    fig.vz *= 0.55;
  } else {
    const j = vn * 0.6;
    ball.vx += hit.ox * j;
    ball.vz += hit.oz * j;
    fig.vx -= hit.ox * j * 0.4;
    fig.vz -= hit.oz * j * 0.4;
  }
  fig.settled = false;
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

export function clampBallToPitch(ball: FlickBallState, dims: FlickPitchDims = FLICK_PITCH): void {
  const hl = halfLength(dims);
  const hw = halfWidth(dims) - ball.radius;
  const halfG = dims.goalWidth / 2;
  // Side walls
  if (ball.z < -hw) {
    ball.z = -hw;
    ball.vz = Math.abs(ball.vz) * 0.55;
  } else if (ball.z > hw) {
    ball.z = hw;
    ball.vz = -Math.abs(ball.vz) * 0.55;
  }
  // End walls — open goal mouth
  if (ball.x > hl - ball.radius && Math.abs(ball.z) > halfG) {
    ball.x = hl - ball.radius;
    ball.vx = -Math.abs(ball.vx) * 0.5;
  } else if (ball.x < -hl + ball.radius && Math.abs(ball.z) > halfG) {
    ball.x = -hl + ball.radius;
    ball.vx = Math.abs(ball.vx) * 0.5;
  }
  ball.y = dims.playY + ball.radius;
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

export function stepFlickWorld(
  figures: FlickFigureState[],
  ball: FlickBallState,
  dt: number,
  dims: FlickPitchDims = FLICK_PITCH,
): void {
  for (const f of figures) {
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    stepFlickFriction(f, dt);
    clampFigureToPitch(f, dims);
    updateFigureLean(f);
  }
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  stepBallFriction(ball, dt);
  clampBallToPitch(ball, dims);

  for (let i = 0; i < figures.length; i++) {
    for (let j = i + 1; j < figures.length; j++) {
      collideFigures(figures[i]!, figures[j]!);
    }
    collideFigureBall(figures[i]!, ball);
  }
  for (const f of figures) clampFigureToPitch(f, dims);
  clampBallToPitch(ball, dims);
}
