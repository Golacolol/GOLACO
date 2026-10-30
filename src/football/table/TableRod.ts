import type { RodSpec, TableDims } from "./TableLayouts";
import { manLocalZs, maxSlideForRod } from "./TableLayouts";

export interface TableRodState {
  spec: RodSpec;
  /** Normalized slide −1..1; applied as slide * maxSlide. */
  slide: number;
  /** Kick angle radians (0 = feet down / neutral). */
  angle: number;
  /** Continuous spin angular velocity (rad/s). */
  spinVel: number;
  /** Remaining one-shot strike arc (radians). 0 = not in a tap-swing. */
  strikeArc: number;
  maxSlide: number;
  manZs: number[];
}

export function createRodState(spec: RodSpec, dims: TableDims): TableRodState {
  return {
    spec,
    slide: 0,
    angle: 0,
    spinVel: 0,
    strikeArc: 0,
    maxSlide: maxSlideForRod(spec.men, dims),
    manZs: manLocalZs(spec.men, dims),
  };
}

export function rodWorldMen(
  rod: TableRodState,
): { x: number; z: number; angle: number }[] {
  const slideZ = rod.slide * rod.maxSlide;
  return rod.manZs.map((lz) => ({
    x: rod.spec.x,
    z: lz + slideZ,
    angle: rod.angle,
  }));
}

/** Slide along the rod. No input → hard stop (no coasting). */
export function stepRodSlide(rod: TableRodState, slideInput: number, dt: number, speed = 5.8): void {
  if (Math.abs(slideInput) < 0.01) return;
  rod.slide = Math.max(-1, Math.min(1, rod.slide + slideInput * speed * dt));
}

const SPIN_ENGAGE = 0.2;
const KICK_IMPULSE = 24;
const STRIKE_ARC = Math.PI * 0.85;
const SPIN_ACCEL = 52;
const SPIN_MAX = 28;
const ANGLE_DAMP = 12;
const SPIN_DAMP = 7.5;
const GRAB_DAMP = 28;

/**
 * Foosball handle:
 * - kickPressed (Space down) → immediate strike through the ball.
 * - Hold past SPIN_ENGAGE → spin while held.
 * - Release OR press while coasting → grab / stop.
 */
export function stepRodKick(
  rod: TableRodState,
  kickHeld: boolean,
  kickHoldSeconds: number,
  kickReleased: boolean,
  dt: number,
  sideSign: number,
  kickPressed = false,
): void {
  const dir = sideSign >= 0 ? 1 : -1;
  const coasting = Math.abs(rod.spinVel) > 1.5 && rod.strikeArc <= 0;

  // Fresh press while already spinning → grab the handle and stop.
  if (kickPressed && coasting) {
    rod.strikeArc = 0;
    rod.spinVel = 0;
  } else if (kickPressed && !coasting) {
    // Immediate strike on press — do not wait for release.
    rod.spinVel = dir * KICK_IMPULSE;
    rod.strikeArc = STRIKE_ARC;
  } else if (kickHeld && kickHoldSeconds >= SPIN_ENGAGE && rod.strikeArc <= 0) {
    rod.spinVel = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, rod.spinVel + dir * SPIN_ACCEL * dt));
  } else if (kickReleased) {
    // Letting go always brakes leftover spin.
    rod.strikeArc = 0;
    rod.spinVel *= 0.1;
  } else if (!kickHeld && rod.strikeArc <= 0) {
    rod.spinVel *= Math.exp(-SPIN_DAMP * dt);
  }

  // While holding (not spinning up yet / after grab), keep braking.
  if (kickHeld && kickHoldSeconds < SPIN_ENGAGE && rod.strikeArc <= 0 && Math.abs(rod.spinVel) > 0.2) {
    rod.spinVel *= Math.exp(-GRAB_DAMP * dt);
  }

  const before = rod.angle;
  rod.angle += rod.spinVel * dt;
  if (rod.strikeArc > 0) {
    rod.strikeArc -= Math.abs(rod.angle - before);
    if (rod.strikeArc <= 0) {
      rod.strikeArc = 0;
      rod.spinVel *= 0.05;
    }
  }

  if (rod.angle > Math.PI * 4) rod.angle -= Math.PI * 4;
  if (rod.angle < -Math.PI * 4) rod.angle += Math.PI * 4;

  if (!kickHeld && rod.strikeArc <= 0 && Math.abs(rod.spinVel) < 0.45) {
    rod.spinVel = 0;
    const target = Math.round(rod.angle / (Math.PI * 2)) * Math.PI * 2;
    rod.angle += (target - rod.angle) * Math.min(1, ANGLE_DAMP * dt);
  }
}

export const TABLE_SPIN_ENGAGE_SECONDS = SPIN_ENGAGE;
