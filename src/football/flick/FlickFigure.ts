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

/** Apply pull-back flick: drag vector is opposite desired travel. */
export function applyFlickImpulse(
  fig: FlickFigureState,
  pullDx: number,
  pullDz: number,
  opts?: { maxPower?: number; powerScale?: number },
): boolean {
  const pull = Math.hypot(pullDx, pullDz);
  const minPull = 0.08;
  if (pull < minPull) return false;
  const maxPower = opts?.maxPower ?? 9.5;
  const scale = opts?.powerScale ?? 14;
  const power = Math.min(maxPower, pull * scale);
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
 * 1-2-3-1-ish Subbuteo kick-off layout (11 per side) on tabletop pitch.
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

  // Home (left half → attack +X)
  add("home", "GK", -hl + 0.55, 0, true);
  add("home", "LB", -hl + 2.2, -hw * 0.55);
  add("home", "CB", -hl + 2.0, -0.55);
  add("home", "CB", -hl + 2.0, 0.55);
  add("home", "RB", -hl + 2.2, hw * 0.55);
  add("home", "LM", -hl + 4.0, -hw * 0.42);
  add("home", "CM", -hl + 3.7, -0.35);
  add("home", "CM", -hl + 3.7, 0.35);
  add("home", "RM", -hl + 4.0, hw * 0.42);
  add("home", "ST", -0.85, -0.45);
  add("home", "ST", -0.85, 0.45);

  // Away (right half → attack −X)
  add("away", "GK", hl - 0.55, 0, true);
  add("away", "LB", hl - 2.2, hw * 0.55);
  add("away", "CB", hl - 2.0, 0.55);
  add("away", "CB", hl - 2.0, -0.55);
  add("away", "RB", hl - 2.2, -hw * 0.55);
  add("away", "LM", hl - 4.0, hw * 0.42);
  add("away", "CM", hl - 3.7, 0.35);
  add("away", "CM", hl - 3.7, -0.35);
  add("away", "RM", hl - 4.0, -hw * 0.42);
  add("away", "ST", 0.85, 0.45);
  add("away", "ST", 0.85, -0.45);

  return figures;
}
