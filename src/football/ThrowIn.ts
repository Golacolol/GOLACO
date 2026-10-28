import { clamp, normalize2, stat01 } from "../core/math";
import { HALF_WIDTH } from "./constants";

/** Max throw distance: weak ~0.42× half-width, strongest = half pitch width (~34m). */
export function throwInMaxDistance(strength: number): number {
  const t = clamp(stat01(strength) / 0.99, 0, 1);
  return HALF_WIDTH * (0.42 + 0.58 * t);
}

export function throwInLanding(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  strength: number,
  hold01: number,
): { x: number; z: number; dist: number } {
  const maxD = throwInMaxDistance(strength);
  let dx = toX - fromX;
  let dz = toZ - fromZ;
  const raw = Math.hypot(dx, dz) || 1;
  const desired = clamp(raw * (0.5 + 0.5 * clamp(hold01, 0, 1)), 5.5, maxD);
  const n = normalize2(dx, dz);
  return {
    x: fromX + n.x * desired,
    z: fromZ + n.z * desired,
    dist: desired,
  };
}

/** Hand-thrown delivery — arcs off the line (not a toe-poke). */
export function throwInKickVector(
  fromX: number,
  fromZ: number,
  landX: number,
  landZ: number,
  strength: number,
  hold01: number,
): { vx: number; vz: number; vy: number } {
  const dx = landX - fromX;
  const dz = landZ - fromZ;
  const dist = Math.hypot(dx, dz) || 1;
  const power = clamp(8.4 + dist * 0.42 + stat01(strength) * 3.6 + hold01 * 5.2, 8.5, 22.5);
  // Clear overhead arc so the release reads as a throw, not a kick.
  const lift = clamp(2.35 + hold01 * 1.35 + dist * 0.028 + stat01(strength) * 0.35, 2.2, 4.6);
  return { vx: (dx / dist) * power, vz: (dz / dist) * power, vy: lift };
}

/** On-pitch receive spot near the throw for the chosen target. */
export function throwInReceiveSpot(ballX: number, ballZ: number, attackSign: number): { x: number; z: number } {
  const zSign = Math.sign(ballZ || 1);
  return {
    x: ballX + attackSign * 2.8,
    z: zSign * (HALF_WIDTH - 3.2),
  };
}
