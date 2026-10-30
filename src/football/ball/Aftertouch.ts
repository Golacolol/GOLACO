import { clamp, normalize2, stat01 } from "../../core/math";
import type { Ball } from "./Ball";

/** Discrete SWOS-style decay over the aftertouch window (tick 0 = strongest). */
export const SPIN_MULTIPLIER_FACTOR = [5, 4, 3, 2, 2, 2, 2, 1, 1, 1] as const;

/** ~10 SWOS team-ticks of curve after release. */
export const AFTERTOUCH_DURATION = 0.36;
/** Stick must register before this age for full late-window bend. */
export const AFTERTOUCH_COMMIT_AGE = 0.12;

export type AftertouchKind = "shot" | "pass";

export interface AftertouchState {
  kind: AftertouchKind;
  /** Unit kick aim at release. */
  dirX: number;
  dirZ: number;
  age: number;
  /** Locked curve side: -1 left of kick, +1 right, 0 undecided. */
  side: -1 | 0 | 1;
  liftApplied: boolean;
  longBoosted: boolean;
  /** 0..1 from technique attrs. */
  skill: number;
  /** Overall bend scale (distance / mode / AI). */
  strengthMul: number;
  /** When set, AI steers curve without stick. */
  aiSide: -1 | 0 | 1 | null;
  /**
   * Human must show stick intent in the early window or late curve is muted
   * (OpenSWOS-style timed aftertouch gate).
   */
  earlyCommit: boolean;
}

export interface OpenAftertouchOpts {
  kind: AftertouchKind;
  dirX: number;
  dirZ: number;
  /** Finishing / curve technique 1–100-ish. */
  technique: number;
  strengthMul?: number;
  aiSide?: -1 | 0 | 1 | null;
}

export function openAftertouch(opts: OpenAftertouchOpts): AftertouchState {
  const dir = normalize2(opts.dirX, opts.dirZ);
  return {
    kind: opts.kind,
    dirX: dir.x || 1,
    dirZ: dir.z,
    age: 0,
    side: 0,
    liftApplied: false,
    longBoosted: false,
    skill: clamp(0.35 + stat01(opts.technique) * 0.65, 0.35, 1),
    strengthMul: clamp(opts.strengthMul ?? 1, 0, 1.35),
    aiSide: opts.aiSide ?? null,
    earlyCommit: opts.aiSide != null,
  };
}

export function aftertouchTick(age: number): number {
  const t = clamp(Math.floor((age / AFTERTOUCH_DURATION) * SPIN_MULTIPLIER_FACTOR.length), 0, SPIN_MULTIPLIER_FACTOR.length - 1);
  return t;
}

export function spinMultiplierAt(age: number): number {
  return SPIN_MULTIPLIER_FACTOR[aftertouchTick(age)]! / 5;
}

/** Left-hand perpendicular to kick direction (world XZ). */
export function kickLeftNormal(dirX: number, dirZ: number): { x: number; z: number } {
  return { x: -dirZ, z: dirX };
}

/**
 * Stick relative to kick: lateral (−1..1 left/right of aim) and along (−1 back .. +1 forward).
 */
export function stickRelativeToKick(
  stickX: number,
  stickZ: number,
  dirX: number,
  dirZ: number,
): { lateral: number; along: number; mag: number } {
  const mag = Math.hypot(stickX, stickZ);
  if (mag < 0.12) return { lateral: 0, along: 0, mag: 0 };
  const s = normalize2(stickX, stickZ);
  const left = kickLeftNormal(dirX, dirZ);
  const lateral = s.x * left.x + s.z * left.z;
  const along = s.x * dirX + s.z * dirZ;
  return { lateral, along, mag };
}

/**
 * Peak lateral acceleration (m/s²) at full multiplier — shots bend harder than passes.
 * Tuned for a visible banana without making the ball unreadable.
 */
export function baseCurveAccel(kind: AftertouchKind): number {
  return kind === "shot" ? 28 : 13;
}

export interface AftertouchStepResult {
  state: AftertouchState | null;
  curved: boolean;
  chipped: boolean;
}

/**
 * Apply one frame of aftertouch: partial direction change only (velocity bend + optional chip).
 * Returns null state when the window closes.
 */
export function stepAftertouch(
  ball: Ball,
  state: AftertouchState,
  stickX: number,
  stickZ: number,
  dt: number,
): AftertouchStepResult {
  const next: AftertouchState = { ...state, age: state.age + dt };
  if (next.age >= AFTERTOUCH_DURATION) {
    return { state: null, curved: false, chipped: false };
  }

  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed < 1.2 && next.age > 0.08) {
    return { state: null, curved: false, chipped: false };
  }

  const rel = stickRelativeToKick(stickX, stickZ, next.dirX, next.dirZ);
  let lateral = rel.lateral;
  let along = rel.along;

  // AI scripted curve when no clear stick (or always lightly for CPU).
  if (next.aiSide && (rel.mag < 0.18 || Math.abs(lateral) < 0.2)) {
    lateral = next.aiSide * (0.55 + next.skill * 0.35);
    along = Math.max(along, 0.1);
  }

  if (!next.earlyCommit && (rel.mag >= 0.2 || next.aiSide)) {
    if (next.age <= AFTERTOUCH_COMMIT_AGE) next.earlyCommit = true;
  }

  if (next.side === 0 && Math.abs(lateral) > 0.28 && rel.mag >= 0.18) {
    next.side = lateral < 0 ? -1 : 1;
  }

  let curved = false;
  const side = next.side !== 0 ? next.side : Math.abs(lateral) > 0.35 ? (lateral < 0 ? -1 : 1) : 0;
  if (side !== 0 && next.strengthMul > 0.05) {
    if (next.side === 0) next.side = side;
    const left = kickLeftNormal(next.dirX, next.dirZ);
    const m = spinMultiplierAt(next.age);
    // Missed early window → muted late banana (still readable, not full SWOS curve).
    const commitMul = next.earlyCommit || next.age <= AFTERTOUCH_COMMIT_AGE ? 1 : 0.38;
    const accel = baseCurveAccel(next.kind) * m * next.skill * next.strengthMul * side * commitMul;
    ball.vx += left.x * accel * dt;
    ball.vz += left.z * accel * dt;
    // Feed persistent sidespin so flight keeps bending after the stick window.
    ball.spinY = clamp(ball.spinY + side * 0.55 * m * next.skill * commitMul * dt * 8, -1.6, 1.6);
    curved = true;
  }

  let chipped = false;
  // Shot chip / loft — once, mid-window (SWOS spinTimer == 4).
  if (next.kind === "shot" && !next.liftApplied && aftertouchTick(next.age) >= 4) {
    next.liftApplied = true;
    if (along < -0.35 && rel.mag >= 0.2) {
      // Pull back → chip
      ball.vy += (1.55 + next.skill * 1.1) * next.strengthMul;
      ball.vx *= 0.9;
      ball.vz *= 0.9;
      chipped = true;
    } else if (rel.mag < 0.15 || Math.abs(along) < 0.25) {
      // Neutral stick → mild loft (SWOS NORMAL arm), not a no-op
      ball.vy += 0.28 * next.strengthMul;
    }
  }

  // Pass: forward / side stick mid-flight adds a little carry (SWOS longPass).
  if (next.kind === "pass" && !next.longBoosted && (along > 0.45 || (Math.abs(lateral) > 0.4 && along > -0.1))) {
    if (rel.mag >= 0.22 || next.aiSide) {
      next.longBoosted = true;
      const boost = 1 + (0.06 + next.skill * 0.05) * next.strengthMul;
      ball.vx *= boost;
      ball.vz *= boost;
    }
  }

  return { state: next, curved, chipped };
}

/** AI curve strength by distance — close shots barely bend (SWOS near-ball = 0). */
export function aiAftertouchStrengthMul(distanceToGoal: number): number {
  if (distanceToGoal < 11) return 0.12;
  if (distanceToGoal < 18) return 0.55;
  if (distanceToGoal < 28) return 0.85;
  return 1;
}

/**
 * Pick AI curve side relative to kick-left normal.
 * Positive side bends toward +kickLeft (world); we choose the side that pulls toward targetZ.
 */
export function aiCurveSide(
  targetZ: number,
  ballZ: number,
  opts?: { dirX?: number; dirZ?: number; rng?: () => number },
): -1 | 1 {
  const rng = opts?.rng ?? Math.random;
  const d = targetZ - ballZ;
  if (Math.abs(d) < 0.35) return rng() < 0.5 ? -1 : 1;
  const dirX = opts?.dirX ?? 1;
  const dirZ = opts?.dirZ ?? 0;
  const left = kickLeftNormal(dirX, dirZ);
  // Which curve side moves the ball toward targetZ?
  if (Math.abs(left.z) < 0.08) return d < 0 ? -1 : 1;
  return d * left.z > 0 ? 1 : -1;
}
