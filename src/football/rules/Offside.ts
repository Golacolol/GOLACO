import { clamp } from "../../core/math";
import { HALF_LENGTH } from "../constants";
import type { Player } from "../players/Player";

/**
 * Second-last opponent X (offside line), including the goalkeeper.
 * Uses attack direction so half-time end swaps stay correct.
 */
export function offsideLineX(opponents: Player[], attackSign: number): number {
  if (!opponents.length) return 0;
  const xs = opponents.map((p) => p.x).sort((a, b) => a - b);
  // Attacking +X → 2nd-largest opponent x; attacking −X → 2nd-smallest.
  if (attackSign >= 0) {
    if (xs.length === 1) return xs[0];
    return xs[xs.length - 2];
  }
  if (xs.length === 1) return xs[0];
  return xs[1];
}

/** Metres beyond the offside line in the attack direction (0 if onside / N/A). */
export function offsideDepthM(
  attacker: Player,
  ballX: number,
  opponents: Player[],
): number {
  if (attacker.isGK) return 0;
  const dir = attacker.attackSign;
  if (attacker.x * dir <= 0.25) return 0;
  if ((attacker.x - ballX) * dir <= 0.15) return 0;
  const line = offsideLineX(opponents, dir);
  return Math.max(0, (attacker.x - line) * dir);
}

/** True if the attacker is in an offside position relative to the ball and defenders. */
export function isInOffsidePosition(
  attacker: Player,
  ballX: number,
  opponents: Player[],
): boolean {
  return offsideDepthM(attacker, ballX, opponents) > 0.22;
}

export function playersOffsideAtPass(
  passer: Player,
  teammates: Player[],
  opponents: Player[],
  ballX: number,
): string[] {
  const ids: string[] = [];
  for (const t of teammates) {
    if (t.id === passer.id || t.isGK) continue;
    if (isInOffsidePosition(t, ballX, opponents)) ids.push(t.id);
  }
  return ids;
}

/** Drop just onside of the current offside line. */
export function offsideRetreatTarget(
  attacker: Player,
  opponents: Player[],
): { x: number; z: number } {
  const dir = attacker.attackSign;
  const line = offsideLineX(opponents, dir);
  const x = clamp(line - dir * 1.05, -HALF_LENGTH + 2, HALF_LENGTH - 2);
  return { x, z: attacker.z * 0.92 };
}
