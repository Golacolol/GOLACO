import { HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_LENGTH, PENALTY_AREA_WIDTH, SIX_YARD_LENGTH, SIX_YARD_WIDTH } from "../constants";
import { attackDir, defendGoalX } from "./PitchEnds";
import type { Side } from "../players/Player";

export function inPenaltyArea(x: number, z: number, side: Side, endsFlipped = false): boolean {
  const own = defendGoalX(side, endsFlipped);
  const minX = own < 0 ? -HALF_LENGTH : HALF_LENGTH - PENALTY_AREA_LENGTH;
  const maxX = own < 0 ? -HALF_LENGTH + PENALTY_AREA_LENGTH : HALF_LENGTH;
  return x >= minX && x <= maxX && Math.abs(z) <= PENALTY_AREA_WIDTH / 2;
}

export function inSixYardArea(x: number, z: number, side: Side, endsFlipped = false): boolean {
  const own = defendGoalX(side, endsFlipped);
  const minX = own < 0 ? -HALF_LENGTH : HALF_LENGTH - SIX_YARD_LENGTH;
  const maxX = own < 0 ? -HALF_LENGTH + SIX_YARD_LENGTH : HALF_LENGTH;
  return x >= minX && x <= maxX && Math.abs(z) <= SIX_YARD_WIDTH / 2;
}

export function attackingThird(x: number, side: Side, endsFlipped = false): boolean {
  const dir = attackDir(side, endsFlipped);
  return x * dir > HALF_LENGTH * 0.28;
}

export function ownHalf(x: number, side: Side, endsFlipped = false): boolean {
  const dir = attackDir(side, endsFlipped);
  return x * dir < 0;
}

export function pitchClamp(x: number, z: number, inset = 1): { x: number; z: number } {
  return {
    x: Math.max(-HALF_LENGTH + inset, Math.min(HALF_LENGTH - inset, x)),
    z: Math.max(-HALF_WIDTH + inset, Math.min(HALF_WIDTH - inset, z)),
  };
}

/** True when a player is pressed against the pitch limit (likely bumping). */
export function onPitchBoundary(x: number, z: number, slack = 0.35): boolean {
  return (
    Math.abs(x) >= HALF_LENGTH + 1.1 - slack ||
    Math.abs(z) >= HALF_WIDTH + 1.1 - slack
  );
}
