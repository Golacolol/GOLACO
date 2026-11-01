import { FLICK_PITCH, type FlickPitchDims } from "./FlickPitch";

export type FlickSide = "home" | "away";

export interface FlickFigureState {
  id: string;
  side: FlickSide;
  isGK: boolean;
  slot: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  radius: number;
  /** Cosmetic lean (rad); snapped to 0 when settled. */
  leanX: number;
  leanZ: number;
  settled: boolean;
}

export function createFigure(
  id: string,
  side: FlickSide,
  slot: string,
  x: number,
  z: number,
  isGK: boolean,
  dims: FlickPitchDims = FLICK_PITCH,
): FlickFigureState {
  const attack = side === "home" ? 1 : -1;
  return {
    id,
    side,
    isGK,
    slot,
    x,
    z,
    vx: 0,
    vz: 0,
    facing: attack > 0 ? Math.PI / 2 : -Math.PI / 2,
    radius: dims.figureRadius,
    leanX: 0,
    leanZ: 0,
    settled: true,
  };
}

/** Minimum drag (m) before a flick registers. */
export const FLICK_MIN_PULL = 0.55;
/**
 * Cap on launch speed (m/s). With FLICK_FIGURE_FRICTION this coasts ~63m —
 * enough for a strong flick from deep in one's half into the far box.
 */
export const FLICK_MAX_POWER = 118;
/** Drag metres → launch speed. ~7.5m pull hits the cap; ~4m still covers ~30m. */
export const FLICK_POWER_SCALE = 14;

/** Launch speed from a pull-back vector (before applying to a figure). */
export function flickPowerFromPull(
  pullDx: number,
  pullDz: number,
  opts?: { maxPower?: number; powerScale?: number },
): number {
  const pull = Math.hypot(pullDx, pullDz);
  if (pull < FLICK_MIN_PULL) return 0;
  const maxPower = opts?.maxPower ?? FLICK_MAX_POWER;
  const scale = opts?.powerScale ?? FLICK_POWER_SCALE;
  return Math.min(maxPower, pull * scale);
}

/** Pull length (m) that yields the given launch speed (ignores min-pull). */
export function pullLengthForPower(
  power: number,
  opts?: { maxPower?: number; powerScale?: number },
): number {
  const maxPower = opts?.maxPower ?? FLICK_MAX_POWER;
  const scale = opts?.powerScale ?? FLICK_POWER_SCALE;
  const capped = Math.min(maxPower, Math.max(0, power));
  return capped / scale;
}

/** Apply pull-back flick: drag vector is opposite desired travel. Tuned for full-pitch scale. */
export function applyFlickImpulse(
  fig: FlickFigureState,
  pullDx: number,
  pullDz: number,
  opts?: { maxPower?: number; powerScale?: number },
): boolean {
  const pull = Math.hypot(pullDx, pullDz);
  if (pull < FLICK_MIN_PULL) return false;
  const power = flickPowerFromPull(pullDx, pullDz, opts);
  if (power <= 0) return false;
  const inv = 1 / pull;
  // Travel = opposite of pull-back.
  fig.vx = -pullDx * inv * power;
  fig.vz = -pullDz * inv * power;
  fig.facing = Math.atan2(fig.vx, fig.vz);
  fig.settled = false;
  return true;
}

export function figureSpeed(fig: FlickFigureState): number {
  return Math.hypot(fig.vx, fig.vz);
}

/**
 * 1-2-3-1-ish Subbuteo kick-off layout (11 per side) on the REAL pitch.
 * Positions are fractions of half-length / half-width so they track dims.
 * Home attacks +X.
 */
export function kickoffFormation(dims: FlickPitchDims = FLICK_PITCH): FlickFigureState[] {
  const hl = dims.length / 2;
  const hw = dims.width / 2;
  const figures: FlickFigureState[] = [];
  let n = 0;
  const add = (side: FlickSide, slot: string, x: number, z: number, gk = false) => {
    figures.push(createFigure(`${side}_${slot}_${n++}`, side, slot, x, z, gk, dims));
  };

  // Home (own half → attack +X)
  add("home", "GK", -hl + hl * 0.08, 0, true);
  add("home", "LB", -hl + hl * 0.32, -hw * 0.55);
  add("home", "CB", -hl + hl * 0.28, -hw * 0.14);
  add("home", "CB", -hl + hl * 0.28, hw * 0.14);
  add("home", "RB", -hl + hl * 0.32, hw * 0.55);
  add("home", "LM", -hl + hl * 0.58, -hw * 0.42);
  add("home", "CM", -hl + hl * 0.52, -hw * 0.1);
  add("home", "CM", -hl + hl * 0.52, hw * 0.1);
  add("home", "RM", -hl + hl * 0.58, hw * 0.42);
  add("home", "ST", -hl * 0.12, -hw * 0.12);
  add("home", "ST", -hl * 0.12, hw * 0.12);

  // Away (own half → attack −X)
  add("away", "GK", hl - hl * 0.08, 0, true);
  add("away", "LB", hl - hl * 0.32, hw * 0.55);
  add("away", "CB", hl - hl * 0.28, hw * 0.14);
  add("away", "CB", hl - hl * 0.28, -hw * 0.14);
  add("away", "RB", hl - hl * 0.32, -hw * 0.55);
  add("away", "LM", hl - hl * 0.58, hw * 0.42);
  add("away", "CM", hl - hl * 0.52, hw * 0.1);
  add("away", "CM", hl - hl * 0.52, -hw * 0.1);
  add("away", "RM", hl - hl * 0.58, -hw * 0.42);
  add("away", "ST", hl * 0.12, hw * 0.12);
  add("away", "ST", hl * 0.12, -hw * 0.12);

  return figures;
}
