import { clamp, normalize2, stat01 } from "../core/math";
import { HALF_WIDTH } from "./constants";

/** Keep throw / GK landings clear of the touchline (metres inside HALF_WIDTH). */
export const TOUCHLINE_SAFE_MARGIN = 5;

export function clampInboundZ(z: number, margin = TOUCHLINE_SAFE_MARGIN): number {
  const lim = HALF_WIDTH - margin;
  return clamp(z, -lim, lim);
}

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
  const inward = -Math.sign(fromZ || 1) || -1;
  // Always aim at an inbound point — never along the touchline toward |z|≈HALF_WIDTH.
  const safeToZ = clampInboundZ(toZ, TOUCHLINE_SAFE_MARGIN);
  let dx = toX - fromX;
  let dz = safeToZ - fromZ;
  // Guarantee a clear inward component so shallow aims don't skim out.
  if (Math.sign(dz) !== inward || Math.abs(dz) < 3.2) {
    dz = inward * Math.max(3.2, Math.abs(dz));
  }
  const raw = Math.hypot(dx, dz) || 1;
  const desired = clamp(raw * (0.5 + 0.5 * clamp(hold01, 0, 1)), 5.5, maxD);
  const n = normalize2(dx, dz);
  const x = fromX + n.x * desired;
  const z = clampInboundZ(fromZ + n.z * desired, TOUCHLINE_SAFE_MARGIN);
  return {
    x,
    z,
    dist: Math.hypot(x - fromX, z - fromZ) || desired,
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
    z: zSign * (HALF_WIDTH - TOUCHLINE_SAFE_MARGIN),
  };
}
