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
  maxSlide: number;
  manZs: number[];
}

export function createRodState(spec: RodSpec, dims: TableDims): TableRodState {
  return {
    spec,
    slide: 0,
    angle: 0,
    spinVel: 0,
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

/** Apply slide input (−1..1 desired rate) and clamp. */
export function stepRodSlide(rod: TableRodState, slideInput: number, dt: number, speed = 2.8): void {
  if (Math.abs(slideInput) < 0.01) return;
  rod.slide = Math.max(-1, Math.min(1, rod.slide + slideInput * speed * dt));
}

const SPIN_ENGAGE = 0.28;
const KICK_IMPULSE = 14;
const SPIN_ACCEL = 38;
const SPIN_MAX = 28;
const ANGLE_DAMP = 4.5;
const SPIN_DAMP = 3.2;

/**
 * Twist / spin from kick hold.
 * holdSeconds < SPIN_ENGAGE on release → snap kick pulse.
 * While held past threshold → continuous spin.
 */
export function stepRodKick(
  rod: TableRodState,
  kickHeld: boolean,
  kickHoldSeconds: number,
  kickReleased: boolean,
  dt: number,
  sideSign: number,
): void {
  if (kickHeld && kickHoldSeconds >= SPIN_ENGAGE) {
    const dir = sideSign >= 0 ? 1 : -1;
    rod.spinVel = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, rod.spinVel + dir * SPIN_ACCEL * dt));
  } else if (kickReleased && kickHoldSeconds > 0.02 && kickHoldSeconds < SPIN_ENGAGE) {
    const dir = sideSign >= 0 ? 1 : -1;
    rod.spinVel += dir * KICK_IMPULSE;
  }

  rod.angle += rod.spinVel * dt;
  // Keep angle bounded for rendering stability
  if (rod.angle > Math.PI * 4) rod.angle -= Math.PI * 4;
  if (rod.angle < -Math.PI * 4) rod.angle += Math.PI * 4;

  if (!kickHeld || kickHoldSeconds < SPIN_ENGAGE) {
    rod.spinVel *= Math.exp(-SPIN_DAMP * dt);
    if (Math.abs(rod.spinVel) < 0.35) {
      rod.spinVel = 0;
      // Settle toward nearest "feet down" (0, ±2π…)
      const target = Math.round(rod.angle / (Math.PI * 2)) * Math.PI * 2;
      rod.angle += (target - rod.angle) * Math.min(1, ANGLE_DAMP * dt);
    }
  }
}

export const TABLE_SPIN_ENGAGE_SECONDS = SPIN_ENGAGE;
