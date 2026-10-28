import { HALF_LENGTH } from "../constants";
import type { Side } from "../players/Player";

/** Attack direction in world X: +1 toward +X, -1 toward -X. */
export function attackDir(side: Side, endsFlipped: boolean): number {
  const base = side === "home" ? 1 : -1;
  return endsFlipped ? -base : base;
}

/** Goal line this side defends (own goal). */
export function defendGoalX(side: Side, endsFlipped: boolean): number {
  return -attackDir(side, endsFlipped) * HALF_LENGTH;
}

/** Goal line this side attacks. */
export function attackGoalX(side: Side, endsFlipped: boolean): number {
  return attackDir(side, endsFlipped) * HALF_LENGTH;
}

/**
 * World pitch ends: "home" = −X, "away" = +X (stadium-fixed).
 * Returns which team currently defends that end.
 */
export function defendingSideAtWorldEnd(worldEnd: "home" | "away", endsFlipped: boolean): Side {
  if (!endsFlipped) return worldEnd;
  return worldEnd === "home" ? "away" : "home";
}

/** Who scored when the ball crosses the world goal at −X (home) or +X (away). */
export function scorerForWorldGoal(worldEnd: "home" | "away", endsFlipped: boolean): Side {
  const defender = defendingSideAtWorldEnd(worldEnd, endsFlipped);
  return defender === "home" ? "away" : "home";
}
