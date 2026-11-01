import {
  GOAL_DEPTH,
  GOAL_WIDTH,
  PENALTY_AREA_LENGTH,
  PENALTY_AREA_WIDTH,
  PITCH_LENGTH,
  PITCH_WIDTH,
} from "../constants";

/**
 * Flickball plays on the REAL pitch footprint (same as Match / Stadium).
 * Home attacks +X; away attacks −X. Piece radii are oversized for bird-view readability.
 */
export interface FlickPitchDims {
  length: number;
  width: number;
  playY: number;
  wallHeight: number;
  goalWidth: number;
  goalDepth: number;
  ballRadius: number;
  /** Figure base radius (hemisphere footprint). */
  figureRadius: number;
  /** Soft penalty box depth from goal line (for GK threat). */
  boxDepth: number;
  boxHalfWidth: number;
}

export const FLICK_PITCH: FlickPitchDims = {
  length: PITCH_LENGTH,
  width: PITCH_WIDTH,
  /** Pitch surface in Stadium / Pitch.ts sits at y ≈ 0. */
  playY: 0,
  wallHeight: 0.28,
  goalWidth: GOAL_WIDTH,
  goalDepth: GOAL_DEPTH,
  /** Oversized vs match ball so Subbuteo bases can strike it cleanly. */
  ballRadius: 0.58,
  figureRadius: 0.85,
  boxDepth: PENALTY_AREA_LENGTH,
  boxHalfWidth: PENALTY_AREA_WIDTH / 2,
};

export function halfLength(d: FlickPitchDims = FLICK_PITCH): number {
  return d.length / 2;
}

export function halfWidth(d: FlickPitchDims = FLICK_PITCH): number {
  return d.width / 2;
}

/** True when ball centre is inside the defending side's soft box. */
export function ballThreatensGoal(
  ballX: number,
  ballZ: number,
  defendSide: "home" | "away",
  d: FlickPitchDims = FLICK_PITCH,
): boolean {
  const hl = halfLength(d);
  const goalX = defendSide === "home" ? -hl : hl;
  const towardGoal = defendSide === "home" ? ballX < -hl + d.boxDepth : ballX > hl - d.boxDepth;
  if (!towardGoal) return false;
  const nearLine = Math.abs(ballX - goalX) < d.boxDepth + 2;
  return nearLine && Math.abs(ballZ) <= d.boxHalfWidth;
}

/** Axis-aligned pad the GK may stand in (goal line ± width, out to ~6yd box). */
export function gkMoveBounds(
  side: "home" | "away",
  d: FlickPitchDims = FLICK_PITCH,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const hl = halfLength(d);
  const r = d.figureRadius;
  const depth = Math.min(d.boxDepth * 0.55, 8);
  const halfZ = d.goalWidth / 2 + r * 0.85;
  if (side === "home") {
    return {
      minX: -hl + r * 0.35,
      maxX: -hl + depth,
      minZ: -halfZ,
      maxZ: halfZ,
    };
  }
  return {
    minX: hl - depth,
    maxX: hl - r * 0.35,
    minZ: -halfZ,
    maxZ: halfZ,
  };
}

/** Clamp a GK into their goal area (no flick travel). */
export function clampGkPosition(
  x: number,
  z: number,
  side: "home" | "away",
  d: FlickPitchDims = FLICK_PITCH,
): { x: number; z: number } {
  const b = gkMoveBounds(side, d);
  return {
    x: Math.max(b.minX, Math.min(b.maxX, x)),
    z: Math.max(b.minZ, Math.min(b.maxZ, z)),
  };
}
