/**
 * Compact Subbuteo-style tabletop pitch (~1/8 real feel).
 * Home attacks +X; away attacks −X.
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
  length: 13.2,
  width: 8.6,
  playY: 0.32,
  wallHeight: 0.28,
  goalWidth: 1.65,
  goalDepth: 0.55,
  /** Larger than real-scale ball for tabletop readability. */
  ballRadius: 0.22,
  figureRadius: 0.28,
  boxDepth: 2.4,
  boxHalfWidth: 3.2,
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
  const nearLine = Math.abs(ballX - goalX) < d.boxDepth + 0.4;
  return nearLine && Math.abs(ballZ) <= d.boxHalfWidth;
}
